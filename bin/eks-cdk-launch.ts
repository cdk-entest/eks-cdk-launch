import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/network-stack";
import { EksClusterStack } from "../lib/eks-cluster-level1-stack";
import { FluxPipeline } from "../lib/code-pipeline-stack";
import { CodePipelineBlogApp } from "../lib/pipeline-stack";
import { EcrStack } from "../lib/ecr-stack";

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

new EcrStack(app, "FlaskAppEcr", {
  repoName: "flask-app",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new FluxPipeline(app, "EksFluxPipelineDemo", {
  repoBranch: "main",
  repoOwner: "entest-hai",
  repoName: "flask-polly-app",
  connectArn: `arn:aws:codestar-connections:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:connection/2b19bab3-49a6-4428-9af1-3140b8aebacf`,
});

new EcrStack(app, "BlogEcr", {
  repoName: "blog-ecr",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new CodePipelineBlogApp(app, "CodePipelineBlogApp", {
  // github
  connectArn: "",
  // github
  repoOwner: "",
  repoBranch: "main",
  repoName: "next-blog-app",
  appName: "blog-app",
  ecrRepoName: "blog-ecr",
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

eks.addDependency(network);
