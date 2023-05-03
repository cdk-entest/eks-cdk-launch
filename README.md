---
title: launch an amazon eks cluster with cdk
author: haimtran
descripton: use cdk to create an amazon eks cluster
publishedDate: 24/04/2023
date: 24/04/2023
---

## Introduction

[Github](https://github.com/cdk-entest/eks-cdk-launch) shows essential components of an Amazon EKS cluster

- Essential Networking
- Essential Scurity
- Launch an EKS Cluster
- Deploy [the First App](https://github.com/cdk-entest/eks-cdk-launch/blob/master/yaml/hello-service.yaml)

## Architecture

![arch](https://user-images.githubusercontent.com/20411077/234173084-3deb3197-cbab-4471-bbff-497c7d6758d9.png)

Essential Networking

- public and private access points
- the control plane is hosted in an AWS account and VPC
- the control plane can auto scale with at least 2 API server instances and 3 ectd instances

Essential Security

- Cluster role so control plane can call other AWS services on your behalf
- Node role for all applications running inside the node
- Use both node role and service account (EC2 launch type) for security best practice
- Use both node role and pod execution role (Faragate launch type) for security best practice
- Three policies are required to attach to the node role
- AmazonEKSClusterPolicy is required to attach to the cluster role

## Network Stack

create a VPC

```ts
const vpc = new aws_ec2.Vpc(this, `${props.name}-Vpc`, {
  vpcName: props.name,
  maxAzs: 3,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  ipAddresses: aws_ec2.IpAddresses.cidr(props.cidr),
  // aws nat gateway service not instance
  natGatewayProvider: aws_ec2.NatProvider.gateway(),
  // can be less than num az default 1 natgw/zone
  natGateways: 1,
  // which public subet have the natgw
  // natGatewaySubnets: {
  //   subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
  // },
  subnetConfiguration: [
    {
      // cdk add igw and route tables
      name: "PublicSubnet",
      cidrMask: 24,
      subnetType: aws_ec2.SubnetType.PUBLIC,
    },
    {
      // cdk add nat and route tables
      name: "PrivateSubnetNat",
      cidrMask: 24,
      subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    },
  ],
});
```

create security group for worker nodes of EKS cluster

```ts
const eksSecurityGroup = new aws_ec2.SecurityGroup(this, "EksSecurityGroup", {
  securityGroupName: "EksSecurityGroup",
  vpc: vpc,
});

eksSecurityGroup.addIngressRule(
  eksSecurityGroup,
  aws_ec2.Port.allIcmp(),
  "self reference security group"
);
```

add a sts vpc endpoint

```ts
vpc.addInterfaceEndpoint("STSVpcEndpoint", {
  service: aws_ec2.InterfaceVpcEndpointAwsService.STS,
  open: true,
  subnets: {
    subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
  },
  securityGroups: [eksSecurityGroup],
});
```

## Cluster Stack

create an EKS cluster using CDK level 1 (equivalent to CloudFormation template)

select subnets where to place the worker nodes

```ts
const subnets: string[] = props.vpc.publicSubnets.map((subnet) =>
  subnet.subnetId.toString()
);
```

create role for the EKS cluster

```ts
const role = new aws_iam.Role(this, `RoleForEksCluster-${props.clusterName}`, {
  roleName: `RoleForEksCluster-${props.clusterName}`,
  assumedBy: new aws_iam.ServicePrincipal("eks.amazonaws.com"),
});

role.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy")
);
```

create an EKS cluster

```ts
const cluster = new aws_eks.CfnCluster(
  this,
  `EksCluster-${props.clusterName}`,
  {
    name: props.clusterName,
    version: "1.25",
    resourcesVpcConfig: {
      // at least two subnets in different zones
      // at least 6 ip address, recommended 16
      subnetIds: subnets,
      //
      endpointPrivateAccess: false,
      //
      endpointPublicAccess: true,
      // cidr block allowed to access cluster
      // default 0/0
      publicAccessCidrs: ["0.0.0.0/0"],
      // eks will create a security group to allow
      // communication between control and data plane
      // nodegroup double check
      securityGroupIds: [props.eksSecurityGroup.securityGroupId],
    },
    kubernetesNetworkConfig: {
      // don not overlap with VPC
      // serviceIpv4Cidr: "",
    },
    // role for eks call aws service on behalf of you
    roleArn: role.roleArn,
    logging: {
      // by deault control plan logs is not exported to CW
      clusterLogging: {
        enabledTypes: [
          {
            // api | audit | authenticator | controllerManager
            type: "api",
          },
          {
            type: "controllerManager",
          },
          {
            type: "scheduler",
          },
          {
            type: "authenticator",
          },
          {
            type: "audit",
          },
        ],
      },
    },
  }
);
```

create role for worker node

```ts
const nodeRole = new aws_iam.Role(this, `RoleForEksNode-${props.clusterName}`, {
  roleName: `RoleForEksNode-${props.clusterName}`,
  assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
});

nodeRole.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy")
);

nodeRole.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
    "AmazonEC2ContainerRegistryReadOnly"
  )
);

nodeRole.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy")
);
```

add an aws managed group the the cluster

```ts
const nodegroup = new aws_eks.CfnNodegroup(this, "AWSManagedNodeGroupDemo", {
  nodegroupName: "AWSManagedNodeGroupDemo",
  // kubernetes version default from cluster
  // version: "",
  nodeRole: nodeRole.roleArn,
  clusterName: cluster.name!,
  subnets: subnets,
  // eks ami release version default latest
  // releaseVersion: ,
  capacityType: "ON_DEMAND",
  // default t3.medium
  instanceTypes: ["t2.medium"],
  diskSize: 50,
  // ssh remote access
  remoteAccess: {
    ec2SshKey: "eks-node-ssh",
  },
  // scaling configuration
  scalingConfig: {
    desiredSize: 2,
    maxSize: 5,
    minSize: 1,
  },
  // update configuration
  updateConfig: {
    maxUnavailable: 1,
    // maxUnavailablePercentage: 30,
  },
  // label configuration
  labels: {
    environment: "dev",
  },
});
```

## Fargate Profile

create pod role

```ts
const podRole = new aws_iam.Role(
  this,
  `RoleForFargatePod-${props.clusterName}`,
  {
    roleName: `RoleForFargatePod-${props.clusterName}`,
    assumedBy: new aws_iam.ServicePrincipal("eks-fargate-pods.amazonaws.com"),
  }
);

podRole.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
    "AmazonEKSFargatePodExecutionRolePolicy"
  )
);
```

create a Fargate profile

```ts
const appFargateProfile = new aws_eks.CfnFargateProfile(
  this,
  "FirstFargateProfileDemo1",
  {
    clusterName: cluster.name!,
    podExecutionRoleArn: podRole.roleArn,
    selectors: [
      {
        namespace: "demo",
        labels: [
          {
            key: "environment",
            value: "dev",
          },
        ],
      },
    ],
    fargateProfileName: "demo",
    // default all private subnet in the vpc
    subnets: subnets,
    tags: [
      {
        key: "name",
        value: "test",
      },
    ],
  }
);
```

## Node Selector

When an EKS cluster consists of EC2 nodegroup and Fargate profile, in some cases, we want to select specific pods to run some pods. To do that, we can use node labels, node selector, or affinity. For example, as Fargate profile does not support deamonset, we can select only EC2 nodes to launch deamon set as the following

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: eks.amazonaws.com/compute-type
              operator: NotIn
              values:
                - fargate
```

show labels of nodes

```bash
kubect get nodes --show-labels
```

## Cluster Authentication

- Kubernetes Role
- Kubernetes RoleBinding
- AWS IAM and RBAC

Kubernetes Role to setup permissions or what actions are allowed

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  creationTimestamp: null
  namespace: default
  name: dev-role
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "patch", "update", "watch"]
```

Kubernetes RoleBinding to bind an identity (group or user) with the Role

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  creationTimestamp: null
  name: dev-role-binding
  namespace: default
subjects:
  - kind: User
    name: developer
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: dev-role
  apiGroup: rbac.authorization.k8s.io
```

Update the aws-auth configmap

```bash
kubectl edit -n kube-system configmap/aws-auth
```

```yaml

```

Update the kube config

```bash
aws eks update-kubeconfig --name $ClusterName --role-arn $ROLE
```

## Observability

As the cluster using both EC2 nodegroup and Faragate profile, we need to setup both CloudWatch Agent and Fluent-bit for EC2 nodegroup and ADOT for Faragate profile. Also need to setup the metric server

Install metric sersver

```yaml
check the yaml/metric-server.yaml
```

Install CloudWatch Agent and Fluent-bit in EC2 Nodegroup

- replace region with your target region
- replace cluster-name with your cluster-name

```yaml
check the yaml/cwagent-fluent-bit.yaml
```

Install ADOT in Fargate profile:

- assume the CF exection role
- install iamserviceaccount by assuming CF exection role
- install ADOT agent by using the default role

To assume CF exection role

```bash
aws sts assume-role --role-arn 'arn:aws:xxx' --role-session-name eks
```

Then update the ~/.aws/credentials with recevied credentials, then run the below bash script

```bash
#!/bin/bash
CLUSTER_NAME=EksClusterLevel1
REGION=ap-southeast-1
SERVICE_ACCOUNT_NAMESPACE=fargate-container-insights
SERVICE_ACCOUNT_NAME=adot-collector
SERVICE_ACCOUNT_IAM_ROLE=EKS-Fargate-ADOT-ServiceAccount-Role
SERVICE_ACCOUNT_IAM_POLICY=arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

eksctl utils associate-iam-oidc-provider \
--cluster=$CLUSTER_NAME \
--approve

eksctl create iamserviceaccount \
--cluster=$CLUSTER_NAME \
--region=$REGION \
--name=$SERVICE_ACCOUNT_NAME \
--namespace=$SERVICE_ACCOUNT_NAMESPACE \
--role-name=$SERVICE_ACCOUNT_IAM_ROLE \
--attach-policy-arn=$SERVICE_ACCOUNT_IAM_POLICY \
--approve
```

After created the iamserviceaccount, use the default role to run below command

```bash
ClusterName=EksClusterLevel1
REGION=ap-southeast-1
curl https://raw.githubusercontent.com/aws-observability/aws-otel-collector/main/deployment-template/eks/otel-fargate-container-insights.yaml | sed 's/YOUR-EKS-CLUSTER-NAME/'${ClusterName}'/;s/us-east-1/'${Region}'/' | kubectl apply -f -
```

## Troubleshooting

Since the cluster created by CloudFormation, we need to run kube config update before can run kubectl from our terminal. Find the cloudformation execution role from aws console, then replace below role arn with the CF exection role.

```bash
aws eks update-kubeconfig --name cluster-xxxxx --role-arn arn:aws:iam::112233445566:role/yyyyy
```

Make sure that the role which your terminal assuming has a trust relationship with the CF execution role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::$ACCOUNT:role/TeamRole"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Since the EKS cluster is created by an CloudFormation execution role, we need to take note

- Update kube config with the role before running kubectl
- Ensure that your terminal can assume the CF execution role (trust policy)
- Assume the CF execution role, aws configure before running eksctl

## Reference

- [Setup Container Insights](https://repost.aws/knowledge-center/cloudwatch-container-insights-eks-fargate)

- [Container Insights Fargate](https://aws-otel.github.io/docs/getting-started/container-insights/eks-fargate)

- [Fluent-bit EKS Fargate](https://aws.amazon.com/blogs/containers/fluent-bit-for-amazon-eks-on-aws-fargate-is-here/)

- [Node Selector Fluent-bit not in Fargate](https://github.com/aws/amazon-vpc-cni-k8s/blob/master/config/master/aws-k8s-cni-cn.yaml#L100)

- [eksctl Service Account](https://aws.amazon.com/blogs/containers/introducing-amazon-cloudwatch-container-insights-for-amazon-eks-fargate-using-aws-distro-for-opentelemetry/)

- [Fargate Profile CPU and Mem](https://docs.aws.amazon.com/eks/latest/userguide/fargate-pod-configuration.html)
