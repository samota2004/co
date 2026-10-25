# Risk and trust assessment status

## What the application currently measures

- The endpoint agent stores validated observations in `EndpointEvent`. The Risk Analysis view evaluates **employee-attributed** interactive observations and recorded security assessments from the last 24 hours. This is a **read-only, partial observation score**, not the saved account policy score or a Random Forest prediction. Device-wide observations remain in coverage counts but cannot create an employee risk score. A device-wide off-hours event alone therefore leaves employee observed risk unassessed.
- `SecurityService.evaluate` processes supported, server-validated security events. The risk engine applies configured evidence weights, keeps only the strongest factor in each category, caps contextual evidence at 100, and takes the larger of contextual and valid model evidence. It stores the resulting account risk and a `RiskScore` history row. These weights are operational policy rules, not measured threat probabilities.
- Trust is an operational policy state. `evolveTrust` changes the persisted number after a security assessment; it is not an independently calibrated likelihood. An unchanged registration number does not establish observed trust.

## Unassessed accounts

The existing database schema still stores registration numbers (`riskScore=0`, `trustScore=100`; older synthetic seeds may use 90). These numbers are **not monitoring results**. Employee Monitoring and Admin Dashboard now return `null` for risk without a `RiskScore` record and trust without `trustUpdatedAt`, and display **Not assessed**. Risk Analysis also hides unassessed stored values. Protected-resource authorization does not accept registration trust as verified trust; it requires a reviewed approval for the specific authorized resource. Approval cannot grant a missing role or bypass current MFA, restriction, freeze, or critical hold. Existing risk/trust values and histories have not been overwritten.

This is an interim compatibility safeguard. Removing the numeric database defaults entirely requires a reviewed nullable-schema migration and updates to all policy, authentication, session, seed, export, and legacy API consumers. Existing records with no trustworthy provenance cannot be automatically relabelled as measured or unmeasured solely by their numeric value.

## What monitoring cannot yet establish

Raw endpoint observations are stored and shown, but they do not automatically write `User.riskScore` or `User.trustScore`. An observation may be device-wide, duplicated, delayed, or outside the model's source semantics. The current agent cannot produce the saved Random Forest model's complete 21-feature CERT user-day input. No missing features are filled with zeros and no RF inference is run for incomplete live telemetry.

Before automatically updating account policy from endpoint activity, define and test: verified employee attribution, accepted event types, event-time ordering, deduplication, evidence windows and expiry, response to missing telemetry, trust initiation and recovery, audit records, and the effect on MFA, approval, and account holds. A benign observation must not erase an unresolved incident or active hold. Review policy weights with labelled sequences before treating them as operationally validated.
