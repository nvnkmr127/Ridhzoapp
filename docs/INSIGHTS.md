# Ridhzo "Insights": Product & Marketing Specification

> **Document Type:** Product Architecture, Feature Analysis & Website Marketing Reference  
> **Target Audience:** Chief Revenue Officers (CROs), VPs of Sales, Heads of Operations, Growth Directors, Enterprise Buyers  
> **Source Verification:** Verified against live Ridhzo codebase (`src/app/(dashboard)/insights/page.tsx`, 18 dedicated domain analytics services in `src/domains/leads/`, and PostgreSQL/Drizzle schema).

---

## 1. Insights Overview

### What the Insights Page Is
The **Ridhzo Insights Page** (`/insights`) is the advanced commercial analytics, predictive forecasting, and revenue intelligence engine of the Ridhzo platform. While the **Executive Dashboard** (`/`) is designed for immediate operational velocity (tracking daily response times, SLA compliance, and hot leads) and **My Dashboard** (`/my-dashboard`) provides frontline sales reps with a focused personal task cockpit, **Insights** serves as the macro strategic laboratory for organizational leadership.

Insights transforms historical interaction data, sales pipeline transitions, communication logs, and customer purchasing patterns into actionable business intelligence. It answers foundational strategic questions:
* **"What is our projected weighted revenue for the upcoming quarter?"**
* **"Where are deals bottlenecked or decaying in our pipeline?"**
* **"Which marketing channels yield the highest lifetime customer value versus raw lead volume?"**
* **"Which sales representatives have available bandwidth, and who is over-allocated?"**
* **"What is the exact day and hour our prospects are most receptive to outreach?"**

### Why It Exists in Ridhzo
Most CRMs treat analytics as an afterthought, forcing executives to export CSVs into external business intelligence tools (Tableau, PowerBI) or build brittle spreadsheets. This creates a time lag of days or weeks between an operational failure (e.g., deal stagnation or channel degradation) and executive awareness.

Ridhzo's Insights engine was engineered directly into the core PostgreSQL database layer to execute continuous pipeline forensics across four core pillars:
1. **Algorithmic Pipeline Health (Composite Scorecard):** Synthesizes speed, deal health, stagnation, and outreach frequency into an objective letter grade (A/B/C/D).
2. **Probability-Weighted Financial Forecasting:** Calculates both raw unweighted pipeline value and probability-adjusted revenue projections.
3. **Process Velocity & Stagnation Diagnostics:** Identifies the exact stage where prospective deals stall and quantifies monetary value at risk.
4. **Unit Economics & Attribution ROI:** Evaluates customer lifetime value (LTV), repeat purchase frequency, and true channel ROI.

### Who Uses It
* **Chief Revenue Officers (CROs) & Chief Financial Officers (CFOs):** Establish accurate revenue forecasting, model cash flow, and measure customer acquisition cost (CAC) efficiency.
* **VPs of Sales & Commercial Directors:** Conduct weekly pipeline inspections, diagnose win/loss drivers, analyze rep capacity, and optimize quota allocation.
* **Sales Enablement & Operations Managers:** Identify coaching opportunities (e.g., low conversion between New $\to$ Active stages), balance rep workloads, and enforce follow-up escalation rules.
* **Marketing & Growth Leaders:** Assess true downstream revenue generation across acquisition channels and target high-converting geographic territories.

### Business Problems It Solves
* **Unpredictable Revenue Forecasting:** Replaces subjective sales rep optimism with mathematical, stage-weighted revenue projections.
* **Invisible Pipeline Decay:** Surfaces leads quietly rotting in intermediate stages before they are officially declared lost.
* **Flawed Channel Attribution:** Exposes channels that generate high lead volume but zero revenue, preventing wasted marketing budgets.
* **Unbalanced Team Workload:** Quantifies rep capacity limits to stop overburdening top closers while under-allocating newer reps.
* **Guesswork in Sales Outreach Timing:** Analyzes thousands of historical touchpoints to prescribe the exact optimal day and time to contact prospects.

### How It Differs from the Executive Dashboard and My Dashboard
| Dimension | Insights (`/insights`) | Executive Dashboard (`/`) | My Dashboard (`/my-dashboard`) |
| :--- | :--- | :--- | :--- |
| **Audience** | CROs, VPs of Sales, Sales Ops, Analysts | CEOs, Founders, Sales Leaders | Frontline Account Executives, BDRs |
| **Horizon** | **Strategic & Predictive:** Quarters, cohorts, forecasting | **Operational & Tactical:** Today, 7d, 30d velocity | **Daily Execution:** Today's active tasks & pipeline |
| **Key Questions** | *"Why are we winning/losing, and what will we close?"* | *"Are reps hitting our 15-minute response SLA today?"* | *"Who do I need to call before 5:00 PM today?"* |
| **Core Output** | Composite Grade, Weighted Forecast, BANT matrix, LTV | Speed-to-lead, SLA compliance, hot leads, top sources | Personal pipeline area curve, personal tasks |
| **Data Depth** | 18 specialized analytic domain engines | 3 core operational services | Scoped personal metrics |

### How Leadership Uses It in Practice
1. **Monday Morning Sales Pipeline Review (09:00 AM):** 
   The VP of Sales reviews the **Pipeline Scorecard**. If the organization's composite health drops from Grade A to Grade B, the leadership team examines the sub-scores (SLA, Health, Stagnation, Velocity) and reads the automated recommendations.
2. **Monthly Financial & Quota Reconciliation:** 
   The CRO compares **Weighted Revenue Projection** against financial targets. They review the **Stage Breakdown Table** to verify whether late-stage deals have sufficient volume to bridge quota gaps.
3. **Mid-Week Operational Audit:** 
   Sales Operations inspects **Stuck in Stage** and **Overdue Follow-ups Escalation**. Leads with "Critical" severity (overdue $> 48$ hours) are flagged for immediate manager re-assignment.
4. **Quarterly Marketing Planning:** 
   Growth leadership reviews **Lead Source ROI** and **Customer LTV**, cutting spend on low-yield sources and doubling down on channels with high repeat purchase rates.

---

## 2. Everything Included in the Insights Page

The Insights page aggregates 18 backend domain analytics services into a unified, high-density command surface:

```
+====================================================================================+
| 1. PIPELINE SCORECARD: Composite Grade (A/B/C/D), 0-100 Score, SLA/Health/Stag/Vel  |
+====================================================================================+
| 2. BEST TIME TO REACH: Best Hour of Day, Best Weekday, Touchpoints Analyzed        |
+====================================================================================+
| 3. REVENUE FORECAST: Weighted Projection, Unweighted Pipeline, Won Revenue + Table |
+====================================================================================+
| 4. WIN / LOSS ANALYSIS (Win Rate, Lost Reason Breakdown) | 5. ENGAGEMENT HEALTH     |
+==========================================================+=========================+
| 6. LEAD QUALIFICATION (BANT Score, SQL/MQL Breakdown)    | 7. PIPELINE VELOCITY    |
+==========================================================+=========================+
| 8. PIPELINE AGING MATRIX: Avg Age, Stale Value at Risk, 4 Aging Time Buckets       |
+====================================================================================+
| 9. TEAM LEADERBOARD (Rank, Won, Win %, Revenue)          | 10. STUCK IN STAGE      |
+==========================================================+=========================+
| 11. CUSTOMER LTV & VIP CLIENTS                           | 12. CHANNEL MIX (Bars)  |
+==========================================================+=========================+
| 13. MONTHLY COHORTS RETENTION TABLE (Cohort Month, Won, Conversion %, Churn %)     |
+====================================================================================+
| 14. LEADS BY LOCATION (Territory Table)                  | 15. ACTIVITY TODAY      |
+==========================================================+=========================+
| 16. LEAD SOURCE ROI TABLE (Attribution, Won Deals, Win Rate, Total Revenue, Avg)  |
+====================================================================================+
| 17. REP WORKLOAD & CAPACITY TABLE                        | 18. OVERDUE ESCALATIONS |
+====================================================================================+
```

### 1. Pipeline Scorecard (`PipelineScorecardService`)
* **What It Shows:** An overall composite letter grade (`A`, `B`, `C`, `D`), an overall health score out of 100, four sub-dimension scores (`SLA`, `Health`, `Stagnation`, `Velocity`), and automated contextual recommendations.
* **Calculation:** 
  $$\text{Overall Score} = (\text{SLA Score} \times 0.30) + (\text{Health Score} \times 0.30) + (\text{Stagnation Score} \times 0.20) + (\text{Velocity Score} \times 0.20)$$
  * *Grade A:* $\ge 85$ | *Grade B:* $70 - 84.9$ | *Grade C:* $55 - 69.9$ | *Grade D:* $< 55$.
* **Business Use:** Executive summary grade that immediately informs board members and C-level leaders if the sales machine is operating at peak performance.

### 2. Best Time to Reach Your Leads (`OptimalContactTimeService`)
* **What It Shows:** The highest-converting hour of the day (e.g., `10:00 AM - 11:00 AM`), the highest-response weekday (e.g., `Tuesday`), and the total number of historical communication touchpoints analyzed.
* **Calculation:** Bins thousands of activity timestamps from the `activities` table across a 24-hour array and 7-day weekday matrix to find statistical response peaks.
* **Business Use:** Guides outbound campaign scheduling, cold call power-hours, and automated message cadences to maximize connection rates.

### 3. Revenue Forecast (`RevenueForecastService`)
* **What It Shows:** 
  * **Weighted Projection:** Probability-adjusted pipeline value.
  * **Unweighted Pipeline:** Total gross expected value of all open leads.
  * **Won Revenue:** Actual closed-won revenue to date.
  * **Stage Breakdown Table:** Stage name, lead count, mathematical probability weight %, and stage weighted value.
* **Calculation:**
  * Probability Weights: `Won = 100%`, `Active = 50%`, `New = 10%`, `Lost = 0%`, `Unqualified = 0%`.
  * $\text{Weighted Projection} = \sum (\text{Lead Expected Value} \times \text{Stage Weight})$.
* **Business Use:** Provides CFOs and commercial leaders with dependable revenue expectations for quarterly forecasting.

### 4. Win / Loss & Loss Reason Taxonomy (`WinLossAnalyticsService`)
* **What It Shows:** True win rate percentage, absolute counts of won, lost, and unqualified leads, and an itemized breakdown of **Top Loss Reasons** (`leads.lost_reason`) with count and percentage.
* **Calculation:** $\text{Win Rate} = \frac{\text{Won}}{\text{Won} + \text{Lost} + \text{Unqualified}} \times 100$.
* **Business Use:** Pinpoints product, pricing, or objection patterns causing lost deals (e.g., "Competitor Price", "Missing Feature", "Timing").

### 5. Engagement Health Radar (`EngagementHealthService`)
* **What It Shows:** Overall health percentage, count of active leads categorized across four health tiers: **Healthy**, **Needs Attention**, **At Risk**, and **Critical** ($> 14$ days silent), plus a live roster of critical leads showing days since last contact.
* **Calculation:** Evaluates elapsed days since `lastContactedAt`.
* **Business Use:** Prevents deal rot by alerting managers to high-value prospects that reps have allowed to go dark.

### 6. Lead Qualification Matrix (BANT) (`LeadQualificationMatrixService`)
* **What It Shows:** Average BANT qualification score (0-100), total active volume, count of **Sales-Qualified Leads (SQL)**, **Marketing-Qualified Leads (MQL)**, and **Unqualified Leads**.
* **Calculation:** Evaluates Budget (`expectedValue > 0`), Authority (company/corporate domain), Need (need tags/customData), and Timeline (`nextFollowUpAt` within 30 days).
* **Business Use:** Audits lead intake quality and ensures reps spend time only on deals with verified budget and urgency.

### 7. Pipeline Velocity & Bottleneck Detection (`PipelineVelocityService`)
* **What It Shows:** Full-funnel conversion rates: `New → Active %`, `Active → Won %`, and `Overall Win %`, alongside an automated **Bottleneck Stage Indicator** highlighting the slowest stage in the pipeline.
* **Calculation:** Analyzes historical state transitions in `lead_status_history` to measure average residence hours per stage.
* **Business Use:** Eradicates pipeline friction by showing where prospective buyers get stuck in the sales process.

### 8. Pipeline Aging Matrix (`PipelineAgingService`)
* **What It Shows:** Average lead age across active pipeline, **Stale Value at Risk** (monetary value tied up in deals older than 30 days), and deal distribution across 4 time buckets: `0-7d (Fresh)`, `8-14d (Moderate)`, `15-30d (Aging)`, and `30d+ (Stale)`.
* **Business Use:** Quantifies pipeline inventory freshness. High value in the 30d+ bucket alerts executives to stale pipeline that requires purging or aggressive discounting.

### 9. Team Performance Leaderboard (`TeamPerformanceService`)
* **What It Shows:** Ranked leaderboard table of active sales representatives featuring: Rank, Rep Name, Total Assigned Leads, Won Deals, Win Rate %, and Total Generated Revenue.
* **Business Use:** Drives transparent sales culture, tracks quota performance, and identifies top performers for peer coaching.

### 10. Stuck in Stage Alerting (`StageStagnationService`)
* **What It Shows:** Live watchlist of active opportunities that have exceeded the 10-day stage stagnation threshold, indicating lead name, current status, and days stuck.
* **Calculation:** Queries active leads where `updatedAt < now - 10 days`, assigning risk levels: Medium ($10-13\text{d}$), High ($14-20\text{d}$), and Critical ($\ge 21\text{d}$).
* **Business Use:** Provides frontline managers with a direct hit-list for pipeline unclogging sessions.

### 11. Customer Lifetime Value (LTV) & VIP Client Roster (`CustomerLtvAnalyticsService`)
* **What It Shows:** Average Customer LTV, Repeat Customer Rate %, Total Unique Customers count, and a VIP Customer roster displaying top clients, lifetime spend, and total won deals.
* **Calculation:** Aggregates multi-deal revenue per unique client identity (matched via phone, email, or client ID).
* **Business Use:** Measures account expansion and retention, proving whether the business builds long-term client relationships or relies entirely on one-off transactions.

### 12. Channel Mix Distribution (`ChannelAnalyticsService`)
* **What It Shows:** Identifies the company's top communication channel, total touchpoints logged, and graphical percentage progress bars comparing WhatsApp messages, phone calls, emails, and notes.
* **Calculation:** Scans `activities.type` and `whatsapp_messages` to quantify outbound channel utilization.
* **Business Use:** Verifies whether sales teams are adopting modern high-converting channels (e.g., WhatsApp) over low-yield cold email.

### 13. Monthly Cohort Retention Matrix (`LeadCohortAnalyticsService`)
* **What It Shows:** Longitudinal table grouping leads by creation month (`YYYY-MM`), tracking Total Leads, Won Deals, Conversion Rate %, and Churn Rate %.
* **Calculation:** Aggregates leads by `createdAt` monthly cohorts and calculates ultimate conversion versus closure.
* **Business Use:** Proves whether sales efficiency and marketing quality are improving or degrading over quarterly time horizons.

### 14. Geographic Concentration Analytics (`LeadGeoAnalyticsService`)
* **What It Shows:** Tabular breakdown of sales performance by territory (City, State, Region, or Country), showing Total Leads, Territorial Win Rate %, and Total Revenue Generated.
* **Calculation:** Parses lead location attributes stored in `leads.customData`.
* **Business Use:** Directs regional marketing budgets and guides territorial sales rep assignment.

### 15. Daily Activity Worklog Digest (`ActivityDigestService`)
* **What It Shows:** Total actions logged today across the company, paired with an individual rep breakdown ranking total logged activities.
* **Calculation:** Real-time query of all actions created between midnight and 23:59:59 of the current calendar day.
* **Business Use:** Real-time operational verification ensuring that reps are executing outbound sales activities every day.

### 16. Lead Source Attribution & True ROI (`SourceRoiAnalyticsService`)
* **What It Shows:** Comprehensive channel ROI table showing Source Name, Source Type (e.g., Meta Ads, Google Ads, Inbound Form), Total Leads, Won Deals, Channel Win Rate %, Total Revenue Generated, and Average Deal Value.
* **Calculation:** Joins `leads` with `lead_sources` to aggregate financial yield per acquisition source.
* **Business Use:** Connects marketing acquisition directly to bankable cash, identifying which lead channels produce high deal sizes versus cheap unqualified leads.

### 17. Rep Workload & Capacity Management (`CapacityAssignmentService`)
* **What It Shows:** Operational capacity table listing every active sales rep, their currently assigned active leads, maximum configured capacity (default: 25 active leads), and remaining bandwidth (color-coded Emerald if available, Rose if at or over capacity).
* **Calculation:** Counts leads in `new` or `active` status per user, calculating $\text{Remaining} = \max(0, \text{Max Capacity} - \text{Active Leads})$.
* **Business Use:** Protects customer experience by preventing round-robin assignment from dumping leads onto overwhelmed representatives.

### 18. Overdue Follow-up Escalation Radar (`FollowUpEscalationService`)
* **What It Shows:** Direct count of breached follow-ups, accompanied by an escalation table listing Lead Name (hyperlinked to lead profile), Severity Badge (`Medium`, `High`, `Critical`), and exact Hours Overdue.
* **Calculation:** Computes elapsed hours past `follow_ups.due_at`:
  * *Medium:* $< 24$ hours overdue
  * *High:* $24 - 47.9$ hours overdue
  * *Critical:* $\ge 48$ hours overdue
* **Business Use:** Immediate management escalation tool to reassign neglected prospects before customer relationships are permanently severed.

---

## 3. Insights Metrics

The following master reference table documents the analytical calculations powering the Insights engine:

| Metric Name | Domain Service | Mathematical Calculation | Strategic Business Meaning |
| :--- | :--- | :--- | :--- |
| **Pipeline Composite Grade** | `PipelineScorecardService` | Weighted index of SLA (30%), Health (30%), Stagnation (20%), Velocity (20%) | Overall operational health grade (A/B/C/D) summarizing entire sales organization. |
| **Optimal Contact Hour** | `OptimalContactTimeService` | $\text{Mode of } \text{activities.created\_at hours } (0-23)$ | Peak time window when prospects historically answer calls and engage with reps. |
| **Weighted Revenue Forecast** | `RevenueForecastService` | $\sum (\text{expectedValue} \times \text{statusWeight})$ where Active=50%, New=10% | Risk-adjusted expected cash realization from current open pipeline. |
| **Closed-Loop Win Rate** | `WinLossAnalyticsService` | $\frac{\text{Won}}{\text{Won} + \text{Lost} + \text{Unqualified}} \times 100$ | Pure sales closing efficiency factoring in lead disqualifications. |
| **Engagement Health Score** | `EngagementHealthService` | $\frac{\text{Healthy Count}}{\text{Total Active Leads}} \times 100$ | Proportion of open pipeline actively in communication within normal cadences. |
| **BANT Qualification Score** | `LeadQualificationMatrixService` | Composite 0-100 evaluation across Budget, Authority, Need, and Timeline | Quantifies top-of-funnel lead qualification readiness before sales investment. |
| **Funnel Stage Velocity** | `PipelineVelocityService` | $\text{Mean elapsed hours between } \text{status transitions}$ | Identifies friction points and measure how many days deals take to advance. |
| **Stale Value at Risk** | `PipelineAgingService` | $\sum \text{expectedValue for active leads older than 30 days}$ | Quantifies capital tied up in stagnating deals at high risk of going cold. |
| **Rep Win Efficiency** | `TeamPerformanceService` | $\frac{\text{Rep Won Leads}}{\text{Rep Closed Leads}} \times 100$ | Objective closing capability isolating skill from lead volume allocation. |
| **Average Customer LTV** | `CustomerLtvAnalyticsService` | $\frac{\text{Total Won Revenue}}{\text{Total Unique Won Clients}}$ | Average lifetime revenue generated per acquired customer account. |
| **Repeat Customer Rate** | `CustomerLtvAnalyticsService` | $\frac{\text{Customers with } \ge 2\text{ Won Deals}}{\text{Total Unique Customers}} \times 100$ | Measures product satisfaction, client retention, and account expansion. |
| **Monthly Cohort Churn** | `LeadCohortAnalyticsService` | $\frac{\text{Lost Leads in Month Cohort}}{\text{Total Leads in Month Cohort}} \times 100$ | Measures whether older lead cohorts are decaying or converting over time. |
| **Source Revenue Yield** | `SourceRoiAnalyticsService` | $\sum \text{expectedValue for won leads by source\_id}$ | Pinpoints exact monetary return generated per inbound marketing channel. |
| **Rep Remaining Capacity** | `CapacityAssignmentService` | $\max(0, \text{Max Capacity Limit} - \text{Active Assigned Leads})$ | Available rep bandwidth before lead assignment rules trigger re-routing. |
| **Escalation Severity** | `FollowUpEscalationService` | Categorizes overdue hours: $\ge 48\text{h} \to \text{Critical}$, $\ge 24\text{h} \to \text{High}$ | Prioritizes executive intervention on severely neglected client follow-ups. |

---

## 4. Visualizations, Tables, and Structural Components

The Insights interface uses high-density responsive tables, status cards, and progress meters designed for complex decision-making:

### 1. Macro Health Cards
* **Composite Scorecard Hero:** Features a prominent letter grade badge (Emerald for `A`, Lime for `B`, Amber for `C`, Rose for `D`), an overall numerical score, 4 sub-stat gauges, and bulleted automated recommendations.
* **Optimal Contact Hero:** Clean 3-card layout highlighting the top contact hour, best weekday, and total historical touchpoints analyzed.

### 2. Financial & Funnel Analytics
* **Revenue Forecast Module:** 3 primary metric callouts (Weighted Projection, Unweighted Pipeline, Won Revenue) followed by a granular **Stage Breakdown Table** displaying lead count, probability weights, and calculated stage values.
* **Win / Loss Diagnostics:** Dual card pairing win rate stats with an itemized progress bar breakdown of specific loss reason taxonomies.

### 3. Operational Integrity & Escalation Tables
* **Team Performance Leaderboard:** Complete ranked table featuring `#rank`, rep name, assigned leads, won count, closing percentage, and total revenue closed.
* **Rep Capacity Matrix:** High-contrast table displaying active lead volume against rep maximums, highlighting remaining capacity in emerald or alert rose.
* **Overdue Follow-up Escalation Roster:** Detailed escalation register showing client names (with direct deep links into dossiers), severity badges, and hours overdue.

---

## 5. Strategic Use Cases for Leadership

### 1. Board & Executive Revenue Forecasting
* **Scenario:** The CFO needs an accurate, defendable revenue forecast for the upcoming board meeting.
* **Insights Workflow:** The executive opens `/insights` and reviews **Revenue Forecast**. Instead of relying on raw pipeline numbers ($500,000 unweighted), they present the **Probability-Weighted Projection** ($185,000), backed by the historical stage breakdown table.

### 2. Marketing Channel Capital Reallocation
* **Scenario:** The marketing team is requesting a 30% budget expansion for social ad campaigns.
* **Insights Workflow:** The Head of Growth inspects the **Lead Source ROI** table. They discover that while social ads drive 500 leads, the win rate is only 4% with an average deal size of $1,200. Conversely, Google Inbound Search generates 150 leads with a 28% win rate and $6,500 average deal value.
* **Strategic Outcome:** Marketing reallocates $20,000 from social ads into search engine acquisition, increasing quarterly gross revenue without increasing total ad spend.

### 3. Preventing Multi-Thousand Dollar Pipeline Decay
* **Scenario:** The VP of Sales wants to reduce deal slippage at the end of the quarter.
* **Insights Workflow:** Leadership checks **Pipeline Aging** and **Stuck in Stage**. They identify $85,000 in "Stale Value at Risk" and 12 deals stuck in the "Proposal Delivered" stage for over 18 days.
* **Strategic Outcome:** The VP initiates a special re-engagement campaign offering limited-time incentives, recovering 4 enterprise deals representing $32,000 in closed-won revenue.

### 4. Intelligent Hiring & Sales Rep Capacity Planning
* **Scenario:** Sales managers are requesting three new hires, claiming the sales floor is overwhelmed.
* **Insights Workflow:** The Operations Director inspects the **Rep Workload & Capacity** table. They find that while two top reps are at 100% capacity (25/25 leads), three junior reps are sitting at only 35% capacity with 16 available slots each.
* **Strategic Outcome:** The company avoids premature hiring costs ($180,000/year salary overhead) and instead reconfigures automated round-robin distribution to feed qualified leads to under-utilized reps.

---

## 6. Marketing-Friendly Feature Explanation

### Why Modern Sales Leaders Rely on Ridhzo Insights

In high-growth companies, standard CRM dashboards tell you *what* happened yesterday, but fail to tell you *why* it happened or *what will happen tomorrow*. **Ridhzo Insights** gives revenue leaders full-spectrum commercial intelligence to forecast revenue, eliminate process bottlenecks, and optimize sales execution.

* **Objective Pipeline Health Scoring:** Eliminate subjective guesswork. Ridhzo grades your entire sales engine from A to D, continuously evaluating response velocity, engagement consistency, and stage throughput.
* **Forecasting You Can Actually Take to the Bank:** Stop relying on optimistic sales rep promises. Our probability-weighted forecasting engine analyzes real stage conversion mechanics to deliver accurate financial projections.
* **Forensic Bottleneck Detection:** Pinpoint the exact moments and stages where prospects stall. Whether leads are dying during initial qualification or stagnating after proposal delivery, Ridhzo highlights the bottleneck so you can fix it.
* **Close the Loop on Marketing Spend:** Connect ad campaigns directly to bankable closed-won revenue. Evaluate every channel not by vanity leads, but by true conversion rates, average deal sizes, and customer lifetime value.
* **Scientific Outreach Timing:** Stop guessing when to call. Ridhzo analyzes thousands of real customer interactions to tell your sales team the exact day of the week and hour of the day prospects are most likely to respond.
* **Smart Capacity Management:** Keep your sales team running at peak efficiency. Ensure top performers are never bottlenecked and customer inquiries are never assigned to overloaded representatives.

---

## 7. Feature List for Website

* **Pipeline Health Scorecard & Composite Grading**  
  An automated executive health score (0-100) and letter grade (A/B/C/D) evaluating organizational SLA compliance, lead engagement, velocity, and stagnation.

* **Probability-Weighted Revenue Forecasting**  
  Mathematical revenue projections that weight open deals by pipeline stage to deliver realistic quarterly financial forecasts.

* **Optimal Contact Hour & Day Intelligence**  
  Machine-analyzed contact timing that reveals the highest-converting days and hours to reach prospects.

* **Win / Loss & Loss Reason Taxonomy**  
  Closed-loop win rate analytics with root-cause loss tracking to identify why opportunities are lost to competitors.

* **Full-Funnel Pipeline Velocity Analytics**  
  Measures transition speed between pipeline stages and automatically identifies the slowest bottleneck in your sales cycle.

* **Stale Pipeline Aging Radar**  
  Visual age-bracket analysis (0-7d, 8-14d, 15-30d, 30d+) that quantifies monetary value at risk in stagnating deals.

* **Customer Lifetime Value (LTV) & VIP Tracking**  
  Tracks repeat customer purchase frequency and profiles top VIP accounts driving enterprise expansion.

* **Multi-Channel Communication Mix**  
  Progress meters tracking team adoption of WhatsApp messaging, phone calls, emails, and internal notes.

* **Longitudinal Monthly Cohort Analytics**  
  Tracks lead conversion, retention, and churn across monthly acquisition cohorts to measure long-term sales process improvement.

* **Geographic Territory Performance**  
  Regional conversion analysis identifying high-performing cities, states, and countries for localized marketing expansion.

* **Daily Worklog & Activity Digest**  
  Real-time verification of daily sales activities broken down by representative to ensure consistent execution.

* **Lead Source Attribution & True ROI**  
  Detailed financial reporting calculating total revenue, closing rates, and average deal sizes per marketing channel.

* **Rep Capacity & Workload Balancing**  
  Tracks real-time rep workload against maximum capacity limits to prevent burnout and optimize lead routing.

* **Overdue Follow-up Escalation Register**  
  Severity-coded escalation tracking (Medium, High, Critical) for follow-ups exceeding scheduled deadlines.

---

## 8. Technical Reference

### Route and Page Architecture
* **Insights Page Component:** [`src/app/(dashboard)/insights/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/insights/page.tsx)
* **Layout Scoping:** [`src/app/(dashboard)/layout.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/layout.tsx)
* **Navigation Entry:** [`src/components/layout/nav.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/nav.ts) (Icon: `TrendingUp`, Group: `Analytics`, href: `/insights`)

### Domain Analytics Services (`src/domains/leads/`)
1. **Pipeline Scorecard:** [`pipelineScorecardService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/pipelineScorecardService.ts) (`getPipelineScorecard`)
2. **Revenue Forecast:** [`revenueForecastService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/revenueForecastService.ts) (`getRevenueForecast`)
3. **Win / Loss Analytics:** [`winLossAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/winLossAnalyticsService.ts) (`getWinLossAnalytics`)
4. **Source ROI & Attribution:** [`sourceRoiAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceRoiAnalyticsService.ts) (`getLeadSourceRoiMetrics`)
5. **Engagement Health:** [`engagementHealthService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/engagementHealthService.ts) (`getEngagementHealthBreakdown`)
6. **Optimal Contact Time:** [`optimalContactTimeService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/optimalContactTimeService.ts) (`getOptimalContactTimes`)
7. **Lead Qualification Matrix (BANT):** [`leadQualificationMatrixService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadQualificationMatrixService.ts) (`getQualificationReport`)
8. **Pipeline Velocity:** [`pipelineVelocityService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/pipelineVelocityService.ts) (`getVelocityMetrics`)
9. **Pipeline Aging:** [`pipelineAgingService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/pipelineAgingService.ts) (`getPipelineAgingMatrix`)
10. **Stage Stagnation:** [`stageStagnationService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/stageStagnationService.ts) (`getStagnantLeads`)
11. **Lead Cohorts:** [`leadCohortAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadCohortAnalyticsService.ts) (`getCohortAnalytics`)
12. **Customer LTV:** [`customerLtvAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/customerLtvAnalyticsService.ts) (`getLtvAnalytics`)
13. **Geographic Analytics:** [`leadGeoAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadGeoAnalyticsService.ts) (`getGeoAnalytics`)
14. **Channel Mix:** [`channelAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/channelAnalyticsService.ts) (`getChannelMetrics`)
15. **Team Leaderboard:** [`teamPerformanceService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/teamPerformanceService.ts) (`getTeamLeaderboard`)
16. **Daily Activity Digest:** [`activityDigestService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/activityDigestService.ts) (`getDailyActivityDigest`)
17. **Rep Capacity:** [`capacityAssignmentService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/capacityAssignmentService.ts) (`getRepCapacities`)
18. **Follow-up Escalations:** [`followUpEscalationService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/followUpEscalationService.ts) (`getOverdueFollowUps`)
19. **SLA Metrics:** [`slaAnalyticsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/slaAnalyticsService.ts) (`getSlaMetrics`)
20. **Engagement Velocity:** [`engagementVelocityService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/engagementVelocityService.ts) (`getEngagementVelocity`)

### Multi-Currency & Locale Support
* **Server Format Resolver:** [`src/lib/format.server.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/format.server.ts) (`getOrgFormat`)
* **Currency Formatter:** [`src/lib/format.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/format.ts) (`formatCurrency`)

### Database Tables & Schema Models (`src/db/schema/`)
* `leads` (`src/db/schema/leads.ts`)
* `leadSources` (`src/db/schema/leads.ts`)
* `leadStatusHistory` (`src/db/schema/leads.ts`)
* `activities` (`src/db/schema/activities.ts`)
* `followUps` (`src/db/schema/activities.ts`)
* `whatsappMessages` (`src/db/schema/whatsapp.ts`)
* `users` (`src/db/schema/users.ts`)
* `organizations` (`src/db/schema/organizations.ts`)
