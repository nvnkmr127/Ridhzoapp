"use server";

import { db } from "@/db";
import { automations, automationTriggers, automationConditions, automationActions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg, requirePermission } from "@/lib/rbac";
import { buildTemplatePayload, type AutomationTemplateId } from "@/lib/automation/templates";
import { ok, fail, actionFail } from "@/lib/actions/result";

const automationSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional(),
  trigger: z.object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  conditions: z.unknown().optional(),
  actions: z.array(z.object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
});

export async function createAutomation(data: unknown) {
  const { organizationId } = await requirePermission("automations.manage");
  const parsedInput = automationSchema.safeParse(data);
  if (!parsedInput.success) {
    return fail("VALIDATION", "Give the automation a name and make sure its trigger and actions are complete.");
  }
  const { name, isActive, trigger, conditions, actions } = parsedInput.data;

  try {
    const { BillingLifecycleService } = await import("@/domains/billing/lifecycleService");
    await BillingLifecycleService.assertFeatureAccess(organizationId, "Automations");

    const newAutomation = await db.transaction(async (tx) => {
    const [created] = await tx.insert(automations).values({
      organizationId,
      name,
      isActive: isActive ?? true,
    }).returning();

    if (trigger) {
      await tx.insert(automationTriggers).values({
        automationId: created.id,
        type: trigger.type,
        config: trigger.config || {},
      });
    }

    if (conditions) {
      await tx.insert(automationConditions).values({
        automationId: created.id,
        config: conditions as Record<string, unknown>,
      });
    }

    if (actions && actions.length > 0) {
      for (let i = 0; i < actions.length; i++) {
        await tx.insert(automationActions).values({
          automationId: created.id,
          type: actions[i].type,
          config: actions[i].config || {},
          orderIndex: i,
        });
      }
    }

    return created;
  });

  revalidatePath("/automations");
  return ok(newAutomation);
  } catch (e) {
    return actionFail(e);
  }
}

export async function updateAutomation(id: string, data: unknown) {
  const { organizationId } = await requirePermission("automations.manage");
  const parsedInput = automationSchema.safeParse(data);
  if (!parsedInput.success) {
    return fail("VALIDATION", "Give the automation a name and make sure its trigger and actions are complete.");
  }
  const { name, isActive, trigger, conditions, actions } = parsedInput.data;

  try {
  const notFound = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(automations).where(and(eq(automations.id, id), eq(automations.organizationId, organizationId)));
    if (!existing) return true;

    await tx.update(automations).set({ name, isActive: isActive ?? true }).where(eq(automations.id, id));

    // Replace trigger/conditions/actions wholesale — atomically inside transaction.
    await tx.delete(automationTriggers).where(eq(automationTriggers.automationId, id));
    await tx.delete(automationConditions).where(eq(automationConditions.automationId, id));
    await tx.delete(automationActions).where(eq(automationActions.automationId, id));

    if (trigger) {
      await tx.insert(automationTriggers).values({ automationId: id, type: trigger.type, config: trigger.config || {} });
    }
    if (conditions) {
      await tx.insert(automationConditions).values({ automationId: id, config: conditions as Record<string, unknown> });
    }
    if (actions && actions.length > 0) {
      for (let i = 0; i < actions.length; i++) {
        await tx.insert(automationActions).values({ automationId: id, type: actions[i].type, config: actions[i].config || {}, orderIndex: i });
      }
    }
    return false;
  });

  if (notFound) return fail("NOT_FOUND", "This automation no longer exists.");
  revalidatePath("/automations");
  return ok({ id });
  } catch (e) {
    return actionFail(e);
  }
}

export async function createAutomationFromTemplate(id: AutomationTemplateId) {
  const payload = buildTemplatePayload(id);
  if (!payload) return fail("VALIDATION", "That automation template is not available.");
  // createAutomation enforces the automations.manage permission and org scoping.
  return createAutomation(payload);
}

export async function getAutomations() {
  // Read = any org member, scoped to their org. Mutations below require automations.manage.
  const { organizationId } = await requireOrg();
  return db.select().from(automations).where(eq(automations.organizationId, organizationId));
}

export async function getAutomation(id: string) {
  const { organizationId } = await requireOrg();
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.organizationId, organizationId)));
  if (!automation) return null;

  const [trigger] = await db.select().from(automationTriggers).where(eq(automationTriggers.automationId, id));
  const [conditions] = await db.select().from(automationConditions).where(eq(automationConditions.automationId, id));
  const actions = await db.select().from(automationActions).where(eq(automationActions.automationId, id));

  return {
    ...automation,
    trigger,
    conditions: conditions?.config,
    actions,
  };
}

export async function toggleAutomation(id: string, isActive: boolean) {
  const { organizationId } = await requirePermission("automations.manage");
  try {
    await db.update(automations).set({ isActive })
      .where(and(eq(automations.id, id), eq(automations.organizationId, organizationId)));
    revalidatePath("/automations");
    return ok({ id, isActive });
  } catch (e) {
    return actionFail(e);
  }
}

export async function deleteAutomation(id: string) {
  const { organizationId } = await requirePermission("automations.manage");
  try {
    // Scope the delete: only owner-org automations. Children are removed once the parent is gone.
    const [owned] = await db.select({ id: automations.id }).from(automations)
      .where(and(eq(automations.id, id), eq(automations.organizationId, organizationId)));
    if (!owned) return fail("NOT_FOUND", "This automation no longer exists.");

    await db.delete(automationTriggers).where(eq(automationTriggers.automationId, id));
    await db.delete(automationConditions).where(eq(automationConditions.automationId, id));
    await db.delete(automationActions).where(eq(automationActions.automationId, id));
    await db.delete(automations).where(eq(automations.id, id));

    revalidatePath("/automations");
    return ok({ deleted: true });
  } catch (e) {
    return actionFail(e);
  }
}
