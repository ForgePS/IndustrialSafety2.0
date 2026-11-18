import * as budgets from "aws-cdk-lib/aws-budgets";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import type { ForgeEnvironmentConfig } from "../config/environment-schema.js";
import { resourceName } from "../utils/naming.js";

export interface ForgeBudgetsProps {
  config: ForgeEnvironmentConfig;
}

/**
 * Monthly cost budget with percentage thresholds.
 * Default developer thresholds: 50%, 80%, 100%, 120%.
 */
export class ForgeBudgets extends Construct {
  readonly topic?: sns.Topic;
  readonly budget?: budgets.CfnBudget;

  constructor(scope: Construct, id: string, props: ForgeBudgetsProps) {
    super(scope, id);
    const { config } = props;
    if (!config.features.enableBudget || !config.features.monthlyBudgetUsd) {
      return;
    }

    this.topic = new sns.Topic(this, "BudgetTopic", {
      topicName: resourceName(config, "sns", "budget"),
      displayName: `Forge ${config.environmentName} budget alerts`,
    });

    const thresholds = config.features.budgetAlertThresholds ?? [50, 80, 100, 120];
    this.budget = new budgets.CfnBudget(this, "Monthly", {
      budget: {
        budgetName: resourceName(config, "budget", "monthly"),
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: config.features.monthlyBudgetUsd,
          unit: "USD",
        },
      },
      notificationsWithSubscribers: thresholds.map((threshold) => ({
        notification: {
          notificationType: threshold > 100 ? "FORECASTED" : "ACTUAL",
          comparisonOperator: "GREATER_THAN",
          threshold,
          thresholdType: "PERCENTAGE",
        },
        subscribers: [
          {
            subscriptionType: "SNS",
            address: this.topic!.topicArn,
          },
        ],
      })),
    });
  }
}
