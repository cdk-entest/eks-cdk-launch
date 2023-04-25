import { Stack, StackProps, aws_ec2, aws_eks, aws_iam } from "aws-cdk-lib";
import { Construct } from "constructs";

interface EksClusterProps extends StackProps {
  clusterName: string;
  eksSecurityGroup: aws_ec2.SecurityGroup;
  vpc: aws_ec2.Vpc;
}

export class EksClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: EksClusterProps) {
    super(scope, id, props);

    const subnets: string[] = props.vpc.publicSubnets.map((subnet) =>
      subnet.subnetId.toString()
    );

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
      }
    );

    // dependencies
    nodegroup.addDependency(cluster);
  }
}
