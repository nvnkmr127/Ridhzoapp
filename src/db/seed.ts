import { db } from './index';
import {
  organizations,
  users,
  roles,
  teams,
  leadSources,
  leadPipelines,
  leadPipelineStages,
  leads,
  activities,
  followUps,
} from './schema';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

const ORG_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('Seeding database with dummy data...');

  // 1. Organization
  await db
    .insert(organizations)
    .values({
      id: ORG_ID,
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'pro',
      timezone: 'UTC',
      currency: 'USD',
    })
    .onConflictDoNothing();

  // 2. Roles
  const [role] = await db
    .insert(roles)
    .values({
      organizationId: ORG_ID,
      name: 'Admin',
      description: 'Organization Administrator',
      permissions: ['*'],
    })
    .onConflictDoNothing()
    .returning();

  const roleId = role?.id ?? null;

  // 3. Teams
  const [teamSales] = await db
    .insert(teams)
    .values({
      organizationId: ORG_ID,
      name: 'Sales Team',
    })
    .onConflictDoNothing()
    .returning();

  const teamId = teamSales?.id ?? null;

  // 4. Primary User & Additional Users
  const passwordHash = await bcrypt.hash('password123', 10);

  await db
    .insert(users)
    .values([
      {
        id: USER_ID,
        organizationId: ORG_ID,
        email: 'admin@acme.com',
        passwordHash,
        firstName: 'Test',
        lastName: 'User',
        roleId,
        teamId,
        isActive: true,
      },
      {
        organizationId: ORG_ID,
        email: 'sarah.smith@acme.com',
        passwordHash,
        firstName: 'Sarah',
        lastName: 'Smith',
        roleId,
        teamId,
        isActive: true,
      },
      {
        organizationId: ORG_ID,
        email: 'john.doe@acme.com',
        passwordHash,
        firstName: 'John',
        lastName: 'Doe',
        roleId,
        teamId,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // 5. Lead Sources
  const [sourceWebsite] = await db
    .insert(leadSources)
    .values({
      organizationId: ORG_ID,
      name: 'Website Contact Form',
      type: 'web_form',
      isActive: 1,
    })
    .onConflictDoNothing()
    .returning();

  const [sourceFB] = await db
    .insert(leadSources)
    .values({
      organizationId: ORG_ID,
      name: 'Facebook Ads',
      type: 'facebook',
      isActive: 1,
    })
    .onConflictDoNothing()
    .returning();

  const sourceWebsiteId = sourceWebsite?.id ?? null;
  const sourceFBId = sourceFB?.id ?? null;

  // 6. Lead Pipeline & Stages
  const [pipeline] = await db
    .insert(leadPipelines)
    .values({
      name: 'Standard Sales Pipeline',
    })
    .onConflictDoNothing()
    .returning();

  const pipelineId = pipeline?.id ?? null;

  let stageNewId: string | null = null;
  let stageContactedId: string | null = null;
  let stageQualifiedId: string | null = null;
  let stageWonId: string | null = null;

  if (pipelineId) {
    const stages = await db
      .insert(leadPipelineStages)
      .values([
        { pipelineId, name: 'New Lead', orderIndex: 1 },
        { pipelineId, name: 'Contacted', orderIndex: 2 },
        { pipelineId, name: 'Qualified', orderIndex: 3 },
        { pipelineId, name: 'Won', orderIndex: 4 },
      ])
      .onConflictDoNothing()
      .returning();

    if (stages.length >= 4) {
      stageNewId = stages[0].id;
      stageContactedId = stages[1].id;
      stageQualifiedId = stages[2].id;
      stageWonId = stages[3].id;
    }
  }

  // Ensure sequential lead display_id trigger is installed
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION assign_lead_display_id() RETURNS trigger AS $$
    BEGIN
      IF NEW.display_id IS NULL THEN
        INSERT INTO lead_counters (organization_id, last_value)
        VALUES (NEW.organization_id, 1)
        ON CONFLICT (organization_id) DO UPDATE SET last_value = lead_counters.last_value + 1
        RETURNING last_value INTO NEW.display_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_assign_lead_display_id ON leads;
    CREATE TRIGGER trg_assign_lead_display_id BEFORE INSERT ON leads
    FOR EACH ROW EXECUTE FUNCTION assign_lead_display_id();
  `);

  // 7. Dummy Leads
  const insertedLeads = await db
    .insert(leads)
    .values([
      {
        organizationId: ORG_ID,
        name: 'Alice Johnson',
        email: 'alice@example.com',
        phone: '+1 555-0101',
        company: 'Innovate Tech',
        status: 'new',
        priority: 'high',
        score: 85,
        expectedValue: '15000.00',
        sourceId: sourceWebsiteId,
        ownerId: USER_ID,
        teamId,
        pipelineId,
        stageId: stageNewId,
      },
      {
        organizationId: ORG_ID,
        name: 'Bob Miller',
        email: 'bob@apexsolutions.io',
        phone: '+1 555-0102',
        company: 'Apex Solutions',
        status: 'active',
        priority: 'medium',
        score: 60,
        expectedValue: '8500.00',
        sourceId: sourceFBId,
        ownerId: USER_ID,
        teamId,
        pipelineId,
        stageId: stageContactedId,
      },
      {
        organizationId: ORG_ID,
        name: 'Carol Danvers',
        email: 'carol@starkenterprises.com',
        phone: '+1 555-0103',
        company: 'Stark Enterprises',
        status: 'won',
        priority: 'high',
        score: 95,
        expectedValue: '45000.00',
        sourceId: sourceWebsiteId,
        ownerId: USER_ID,
        teamId,
        pipelineId,
        stageId: stageWonId,
      },
      {
        organizationId: ORG_ID,
        name: 'David Vance',
        email: 'david@vancemedia.com',
        phone: '+1 555-0104',
        company: 'Vance Media',
        status: 'active',
        priority: 'low',
        score: 40,
        expectedValue: '5000.00',
        sourceId: sourceFBId,
        ownerId: USER_ID,
        teamId,
        pipelineId,
        stageId: stageQualifiedId,
      },
      {
        organizationId: ORG_ID,
        name: 'Eva Green',
        email: 'eva@biotech.org',
        phone: '+1 555-0105',
        company: 'BioTech Labs',
        status: 'unqualified',
        priority: 'low',
        score: 20,
        expectedValue: '2000.00',
        sourceId: sourceWebsiteId,
        ownerId: USER_ID,
        teamId,
        pipelineId,
        stageId: stageNewId,
      },
    ])
    .returning();

  console.log(`Inserted ${insertedLeads.length} leads.`);

  // 8. Dummy Activities & Follow-ups
  const now = new Date();

  for (const lead of insertedLeads) {
    await db.insert(activities).values([
      {
        leadId: lead.id,
        userId: USER_ID,
        type: 'email',
        content: `Sent introductory email to ${lead.name}`,
        occurredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
      {
        leadId: lead.id,
        userId: USER_ID,
        type: 'note',
        content: `Lead expressed interest in enterprise tier pricing for ${lead.company}.`,
        occurredAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
    ]);

    await db.insert(followUps).values({
      leadId: lead.id,
      userId: USER_ID,
      type: 'call',
      title: `Follow-up call with ${lead.name}`,
      description: 'Discuss demo schedule and requirement specification',
      status: 'pending',
      dueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    });
  }

  console.log('Successfully populated database with dummy data.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Failed to seed database:', err);
  process.exit(1);
});
