import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/network-stack";
import { EksClusterStack } from "../lib/eks-cluster-level1-stack";

const app = new cdk.App();

const network = new VpcStack(app, "NetworkStack", {
  cidr: "10.0.0.0/16",
  name: "Network",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const eks = new EksClusterStack(app, "EksClusterLevel1Stack", {
  clusterName: "EksClusterLevel1",
  vpc: network.vpc,
  eksSecurityGroup: network.eksSecurityGroup,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

eks.addDependency(network);
