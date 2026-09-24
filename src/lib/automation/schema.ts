import { z } from "zod";

export const TriggerConfigSchema = z.object({
  type: z.enum([
    'lead.created',
    'lead.updated',
    'lead.assigned',
    'lead.status_changed',
    'lead.stage_changed',
    'lead.tag_added',
    'follow_up.scheduled',
    'follow_up.completed',
    'follow_up.overdue',
    'task.completed',
    'meeting.scheduled',
    'meeting.rescheduled',
    'meeting.completed',
    'meeting.no_show',
    'meeting.cancelled',
  ]),
});

export const BaseConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'contains', 'does_not_contain', 'greater_than', 'less_than']),
  value: z.any(),
});

// For recursive nested conditions
export const ConditionGroupSchema: z.ZodType<any> = z.lazy(() => z.object({
  type: z.enum(['AND', 'OR', 'CONDITION']),
  field: z.string().optional(),
  operator: z.string().optional(),
  value: z.any().optional(),
  conditions: z.array(ConditionGroupSchema).optional(),
}));

export const ActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assign_lead'),
    userId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('change_status'),
    status: z.string().min(1),
  }),
  z.object({
    type: z.literal('create_task'),
    title: z.string().min(1),
    description: z.string().optional(),
    dueAt: z.string(), // ISO String
    userId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('schedule_follow_up'),
    title: z.string().min(1),
    description: z.string().optional(),
    dueAt: z.string(), // ISO String
    userId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('add_note'),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal('send_whatsapp'),
    templateName: z.string().min(1), // Watxio-approved template name
    variables: z.array(z.string()).optional(), // fills {{1}},{{2}}...; values may use lead tokens
  })
]);
