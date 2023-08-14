import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/network-stack";
import { EksClusterStack } from "../lib/eks-cluster-level1-stack";
import { FluxPipeline } from "../lib/code-pipeline-stack";

const app = new cdk.App();

const network = new VpcStack(app, "EksNetworkStack", {
  cidr: "192.168.0.0/16",
  name: "EksVpc",
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

new FluxPipeline(app, "EksFluxPipelineDemo", {
  repoBranch: "main",
  repoOwner: "entest-hai",
  repoName: "flask-polly-app",
  connectArn: `arn:aws:codestar-connections:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:connection/649dd950-d102-49b5-a4cb-075bb484fc09`,
});

eks.addDependency(network);
