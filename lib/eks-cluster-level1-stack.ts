import {
  CfnResource,
  Stack,
  StackProps,
  aws_ec2,
  aws_eks,
  aws_iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface EksClusterProps extends StackProps {
  clusterName: string;
  eksSecurityGroup: aws_ec2.SecurityGroup;
  vpc: aws_ec2.Vpc;
}

export class EksClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: EksClusterProps) {
    super(scope, id, props);

    const subnets: string[] = props.vpc.privateSubnets.map((subnet) =>
      subnet.subnetId.toString()
    );

    // cluster role
    const role = new aws_iam.Role(
      this,
      `RoleForEksCluster-${props.clusterName}`,
      {
        roleName: `RoleForEksCluster-${props.clusterName}`,
        assumedBy: new aws_iam.ServicePrincipal("eks.amazonaws.com"),
      }
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy")
    );

    // create eks cluster using level 1 CDK construct same as CF
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

    // node role
    const nodeRole = new aws_iam.Role(
      this,
      `RoleForEksNode-${props.clusterName}`,
      {
        roleName: `RoleForEksNode-${props.clusterName}`,
        assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      }
    );

    // attach policies for node role
    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEKSWorkerNodePolicy"
      )
    );

    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEC2ContainerRegistryReadOnly"
      )
    );

    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy")
    );

    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "CloudWatchAgentServerPolicy"
      )
    );

    // add inline policy to work with auto-scaling group
    nodeRole.addToPolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:DescribeAutoScalingInstances",
          "autoscaling:DescribeLaunchConfigurations",
          "autoscaling:DescribeTags",
          "autoscaling:SetDesiredCapacity",
          "autoscaling:TerminateInstanceInAutoScalingGroup",
          "ec2:DescribeLaunchTemplateVersions",
        ],
        resources: ["*"],
      })
    );

    // optional: update auto-scaling group tags

    // access s3 and polly
    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );

    nodeRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonPollyFullAccess")
    );

    // aws managed nodegroup
    const nodegroup = new aws_eks.CfnNodegroup(
      this,
      "AWSManagedNodeGroupDemo",
      {
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
        // remoteAccess: {
        //   ec2SshKey: "eks-node-ssh",
        // },
        // scaling configuration
        scalingConfig: {
          desiredSize: 2,
          maxSize: 22,
          minSize: 1,
        },
        // update configuration rolling update
        updateConfig: {
          maxUnavailable: 1,
          // maxUnavailablePercentage: 30,
        },
        // label configuration
        labels: {
          environment: "dev",
        },
      }
    );

    // fargate profile
    const podRole = new aws_iam.Role(
      this,
      `RoleForFargatePod-${props.clusterName}`,
      {
        roleName: `RoleForFargatePod-${props.clusterName}`,
        assumedBy: new aws_iam.ServicePrincipal(
          "eks-fargate-pods.amazonaws.com"
        ),
      }
    );

    podRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEKSFargatePodExecutionRolePolicy"
      )
    );

    podRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "CloudWatchAgentServerPolicy"
      )
    );

    // fargate profile for app
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

    // fargate profile for monitor
    //    const monitorFargateProfile = new aws_eks.CfnFargateProfile(
    //      this,
    //      "MonitorFargateProfile",
    //      {
    //        clusterName: cluster.name!,
    //        podExecutionRoleArn: podRole.roleArn,
    //        selectors: [
    //          {
    //            namespace: "fargate-container-insights",
    //            labels: [],
    //          },
    //        ],
    //        fargateProfileName: "monitor",
    //        // default all private subnet in the vpc
    //        subnets: subnets,
    //        tags: [
    //          {
    //            key: "name",
    //            value: "test",
    //          },
    //        ],
    //      }
    //    );

    // dependencies
    cluster.addDependency(role.node.defaultChild as CfnResource);
    nodegroup.addDependency(cluster);
    //    monitorFargateProfile.addDependency(cluster);
    appFargateProfile.addDependency(cluster);
  }
}
