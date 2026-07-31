# Benchmark results

| Field | Value |
| --- | --- |
| agentModel | claude-sonnet-5 |
| graphqlOkfCommit | 78853bc58f19b0d659dffc103e1ddd3980985996 |
| judgeModel | claude-opus-5 |
| mcpServerPackage | mcp-graphql |
| mcpServerVersion | 2.0.4 |
| runDate | 2026-07-31T12:33:28.117Z |

Accuracy is the median weighted-rubric score across successful trials; tokens are the mean total per run. Errored trials are excluded from both.

## qa

| Scenario | Median accuracy | Mean tokens | Trials | Errored |
| --- | --- | --- | --- | --- |
| okf-bundle | 0.88 | 111,730 | 3 | 0 |
| graphql-mcp | 0.76 | 123,811 | 3 | 0 |
| baseline | 0.29 | 64,112 | 3 | 0 |

## add-review

| Scenario | Median accuracy | Mean tokens | Trials | Errored |
| --- | --- | --- | --- | --- |
| okf-bundle | 1.00 | 161,705 | 3 | 0 |
| graphql-mcp | 1.00 | 133,798 | 3 | 0 |
| baseline | 0.38 | 76,762 | 3 | 0 |

## cancel-reason

| Scenario | Median accuracy | Mean tokens | Trials | Errored |
| --- | --- | --- | --- | --- |
| okf-bundle | 1.00 | 149,323 | 3 | 0 |
| graphql-mcp | 1.00 | 112,596 | 3 | 0 |
| baseline | 1.00 | 136,139 | 3 | 0 |
