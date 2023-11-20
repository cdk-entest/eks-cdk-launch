import {
  Stack,
  StackProps,
  aws_codebuild,
  aws_codepipeline,
  aws_codepipeline_actions,
  aws_iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface FluxPipelineProps extends StackProps {
  connectArn: string;
  repoName: string;
  repoBranch: string;
  repoOwner: string;
}

export class FluxPipeline extends Stack {
  constructor(scope: Construct, id: string, props: FluxPipelineProps) {
    super(scope, id, props);

    // artifact - source code
    const sourceOutput = new aws_codepipeline.Artifact("SourceOutput");

    // artifact - codebuild output
    const codeBuildOutput = new aws_codepipeline.Artifact("CodeBuildOutput");

    // codebuild role
    const codebuildRole = new aws_iam.Role(this, "RoleForCodeBuildFlux", {
      roleName: "RoleForCodeBuildFlux",
      assumedBy: new aws_iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    codebuildRole.attachInlinePolicy(
      new aws_iam.Policy(this, "CodeBuildInlinePolicy", {
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["ecr:*"],
            resources: ["*"],
          }),
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["ssm:*"],
            resources: ["*"],
          }),
        ],
      })
    );

    // codebuild - build ecr image
    const ecrBuild = new aws_codebuild.PipelineProject(
      this,
      "BuildDockerImage",
      {
        projectName: "BuildDockerImage",
        role: codebuildRole,
        environment: {
          privileged: true,
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.MEDIUM,
          environmentVariables: {
            DOCKERHUB_USERNAME: {
              value: "DOCKERHUB_USERNAME",
              type: aws_codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            },
            DOCKERHUB_PASS: {
              value: "DOCKERHUB_PASS",
              type: aws_codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            },
            ACCOUNT_ID: {
              value: this.account,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REGION: {
              value: this.region,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            TAG: {
              value: "xxx",
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },

        buildSpec: aws_codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            install: {
              commands: [
                "echo ${ACCOUNT_ID}",
                "echo ${REGION}",
                "echo ${DOCKERHUB_USERNAME}",
              ],
            },
            pre_build: {
              commands: [
                "docker login --username ${DOCKERHUB_USERNAME} --password ${DOCKERHUB_PASS}",
                "export TAG_NAME=$(date +%s)",
                "aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com",
              ],
            },
            build: {
              commands: [
                "docker build -t flask-app:${CODEBUILD_RESOLVED_SOURCE_VERSION}-${TAG_NAME} -f ./app/Dockerfile ./app/",
                "docker tag flask-app:${CODEBUILD_RESOLVED_SOURCE_VERSION}-${TAG_NAME} ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/flask-app:${CODEBUILD_RESOLVED_SOURCE_VERSION}-${TAG_NAME}",
              ],
            },
            // push ecr image
            post_build: {
              commands: [
                "aws ssm put-parameter --name FlaskApp --type String --value ${CODEBUILD_RESOLVED_SOURCE_VERSION}-${TAG_NAME} --overwrite",
                "docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/flask-app:${CODEBUILD_RESOLVED_SOURCE_VERSION}-${TAG_NAME}",
              ],
            },
          },
        }),
      }
    );

    //
    new aws_codepipeline.Pipeline(this, "EksFluxPipeline", {
      pipelineName: "EksFluxPipeline",
      stages: [
        // source
        {
          stageName: "SourceCode",
          actions: [
            new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: "GitHub",
              owner: props.repoOwner,
              repo: props.repoName,
              branch: props.repoBranch,
              connectionArn: props.connectArn,
              output: sourceOutput,
            }),
          ],
        },

        // build docker image and push to ecr
        {
          stageName: "BuildDockerImage",
          actions: [
            new aws_codepipeline_actions.CodeBuildAction({
              actionName: "BuildDockerImageAction",
              project: ecrBuild,
              input: sourceOutput,
              outputs: [codeBuildOutput],
            }),
          ],
        },
      ],
    });
  }
}
