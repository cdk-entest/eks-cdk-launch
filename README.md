---
title: launch an amazon eks cluster with cdk
author: haimtran
descripton: use cdk to create an amazon eks cluster
publishedDate: 24/04/2023
date: 24/04/2023
---

## Introduction

[Github] shows essential components of an Amazon EKS cluster

- Essential Networking
- Essential Scurity
- Launch an EKS Cluster
- Deploy the First App

## Architecture

- Essential Networking
- Essential Security

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

## Troubleshooting

since the cluster created by CloudFormation, we need to run kube config update from our local terminal, then the terminal can access the cluster via kubectl

```bash

```

## Reference