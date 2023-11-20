import {
  Duration,
  Stack,
  StackProps,
  aws_codebuild,
  aws_codecommit,
  aws_codepipeline,
  aws_codepipeline_actions,
  aws_ecr,
  aws_ecs,
  aws_iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

interface CodePipelineProps extends StackProps {
  readonly connectArn?: string;
  readonly repoName: string;
  readonly repoBranch: string;
  readonly repoOwner: string;
  readonly ecrRepoName: string;
  readonly appName?: string;
  readonly service?: aws_ecs.FargateService;
}

interface CodePipelineBlogAppProps extends StackProps {
  readonly connectArn?: string;
  readonly repoName: string;
  readonly repoBranch: string;
  readonly repoOwner: string;
  readonly ecrRepoName: string;
  readonly appName?: string;
  readonly service?: aws_ecs.FargateService;
}

interface CodePipelineImageAppProps extends StackProps {
  readonly connectArn?: string;
  readonly repoName: string;
  readonly repoBranch: string;
  readonly repoOwner: string;
  readonly ecrRepoName: string;
  readonly appName?: string;
  readonly service?: aws_ecs.FargateService;
}

export class CodePipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: CodePipelineProps) {
    super(scope, id, props);

    // code commit
    const codecommitRepository = new aws_codecommit.Repository(
      this,
      "CodeCommitChatApp",
      {
        repositoryName: props.repoName,
      }
    );

    const ecrRepository = aws_ecr.Repository.fromRepositoryName(
      this,
      "EcrRepositoryForChatApp",
      props.ecrRepoName
    );

    // artifact - source code
    const sourceOutput = new aws_codepipeline.Artifact("SourceOutput");

    // artifact - codebuild output
    const codeBuildOutput = new aws_codepipeline.Artifact("CodeBuildOutput");

    // codebuild role push ecr image
    const codebuildRole = new aws_iam.Role(this, "RoleForCodeBuildBlogApp", {
      roleName: "RoleForCodeBuildChatApp",
      assumedBy: new aws_iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    ecrRepository.grantPullPush(codebuildRole);

    // codebuild - build ecr image
    const ecrBuild = new aws_codebuild.PipelineProject(
      this,
      "BuildChatAppEcrImage",
      {
        projectName: "BuildChatAppEcrImage",
        role: codebuildRole,
        environment: {
          privileged: true,
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.MEDIUM,
          environmentVariables: {
            ACCOUNT_ID: {
              value: this.account,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REGION: {
              value: this.region,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REPO_NAME: {
              value: props.ecrRepoName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            APP_NAME: {
              value: props.appName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            TAG: {
              value: "demo",
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },

        // cdk upload build_spec.yaml to s3
        buildSpec: aws_codebuild.BuildSpec.fromAsset(
          path.join(
            __dirname,
            path.join("buildspec", "./build_spec_chat_app.yaml")
          )
        ),
      }
    );

    // code pipeline
    new aws_codepipeline.Pipeline(this, "CodePipelineChatApp", {
      pipelineName: "CodePipelineChatApp",
      // cdk automatically creates role for codepipeline
      // role: pipelineRole,
      stages: [
        // source
        {
          stageName: "SourceCode",
          actions: [
            // new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            //   actionName: "GitHub",
            //   owner: props.repoOwner,
            //   repo: props.repoName,
            //   branch: props.repoBranch,
            //   connectionArn: props.connectArn,
            //   output: sourceOutput,
            // }),

            new aws_codepipeline_actions.CodeCommitSourceAction({
              actionName: "CodeCommitChatApp",
              repository: codecommitRepository,
              branch: "main",
              output: sourceOutput,
            }),
          ],
        },

        // build docker image and push to ecr
        {
          stageName: "BuildChatAppEcrImageStage",
          actions: [
            new aws_codepipeline_actions.CodeBuildAction({
              actionName: "BuildChatAppEcrImage",
              project: ecrBuild,
              input: sourceOutput,
              outputs: [codeBuildOutput],
            }),
          ],
        },

        // deploy new tag image to ecs service
        // {
        //   stageName: "EcsCodeDeploy",
        //   actions: [
        //     new aws_codepipeline_actions.EcsDeployAction({
        //       // role: pipelineRole,
        //       actionName: "Deploy",
        //       service: props.service,
        //       input: codeBuildOutput,
        //       // imageFile: codeBuildOutput.atPath(""),
        //       deploymentTimeout: Duration.minutes(10),
        //     }),
        //   ],
        // },
      ],
    });
  }
}

export class CodePipelineBlogApp extends Stack {
  constructor(scope: Construct, id: string, props: CodePipelineBlogAppProps) {
    super(scope, id, props);

    // code commit
    const codecommitRepository = new aws_codecommit.Repository(
      this,
      "CodeCommitBlogApp",
      {
        repositoryName: props.repoName,
      }
    );

    const ecrRepository = aws_ecr.Repository.fromRepositoryName(
      this,
      "EcrRepositoryForBlogApp",
      props.ecrRepoName
    );

    // artifact - source code
    const sourceOutput = new aws_codepipeline.Artifact("SourceOutput");

    // artifact - codebuild output
    const codeBuildOutput = new aws_codepipeline.Artifact("CodeBuildOutput");

    // codebuild role push ecr image
    const codebuildRole = new aws_iam.Role(this, "RoleForCodeBuildBlogApp", {
      roleName: "RoleForCodeBuildBlogApp",
      assumedBy: new aws_iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    ecrRepository.grantPullPush(codebuildRole);

    // codebuild - build ecr image
    const ecrBuild = new aws_codebuild.PipelineProject(
      this,
      "BuildBlogAppEcrImage",
      {
        projectName: "BuildBlogAppEcrImage",
        role: codebuildRole,
        environment: {
          privileged: true,
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.MEDIUM,
          environmentVariables: {
            ACCOUNT_ID: {
              value: this.account,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REGION: {
              value: this.region,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REPO_NAME: {
              value: props.ecrRepoName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            APP_NAME: {
              value: props.appName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            TAG: {
              value: "demo",
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },

        // cdk upload build_spec.yaml to s3
        buildSpec: aws_codebuild.BuildSpec.fromAsset(
          path.join("buildspec", "./build_spec_blog_app.yaml")
        ),
      }
    );

    // code pipeline
    new aws_codepipeline.Pipeline(this, "CodePipelineBlogApp", {
      pipelineName: "CodePipelineBlogApp",
      // cdk automatically creates role for codepipeline
      // role: pipelineRole,
      stages: [
        // source
        {
          stageName: "SourceCode",
          actions: [
            // new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            //   actionName: "GitHub",
            //   owner: props.repoOwner,
            //   repo: props.repoName,
            //   branch: props.repoBranch,
            //   connectionArn: props.connectArn,
            //   output: sourceOutput,
            // }),

            new aws_codepipeline_actions.CodeCommitSourceAction({
              actionName: "CodeCommitBlogApp",
              repository: codecommitRepository,
              branch: "main",
              output: sourceOutput,
            }),
          ],
        },

        // build docker image and push to ecr
        {
          stageName: "BuildBlogAppEcrImageStage",
          actions: [
            new aws_codepipeline_actions.CodeBuildAction({
              actionName: "BuildBlogAppEcrImage",
              project: ecrBuild,
              input: sourceOutput,
              outputs: [codeBuildOutput],
            }),
          ],
        },

        // deploy new tag image to ecs service
        // {
        //   stageName: "EcsCodeDeploy",
        //   actions: [
        //     new aws_codepipeline_actions.EcsDeployAction({
        //       // role: pipelineRole,
        //       actionName: "Deploy",
        //       service: props.service,
        //       input: codeBuildOutput,
        //       // imageFile: codeBuildOutput.atPath(""),
        //       deploymentTimeout: Duration.minutes(10),
        //     }),
        //   ],
        // },
      ],
    });
  }
}

export class CodePipelineImageApp extends Stack {
  constructor(scope: Construct, id: string, props: CodePipelineImageAppProps) {
    super(scope, id, props);

    // code commit
    const codecommitRepository = new aws_codecommit.Repository(
      this,
      "CodeCommitImageApp",
      {
        repositoryName: props.repoName,
      }
    );

    const ecrRepository = aws_ecr.Repository.fromRepositoryName(
      this,
      "EcrRepositoryForImageApp",
      props.ecrRepoName
    );

    // artifact - source code
    const sourceOutput = new aws_codepipeline.Artifact("SourceOutput");

    // artifact - codebuild output
    const codeBuildOutput = new aws_codepipeline.Artifact("CodeBuildOutput");

    // codebuild role push ecr image
    const codebuildRole = new aws_iam.Role(this, "RoleForCodeBuildImageApp", {
      roleName: "RoleForCodeBuildImageApp",
      assumedBy: new aws_iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    ecrRepository.grantPullPush(codebuildRole);

    // codebuild - build ecr image
    const ecrBuild = new aws_codebuild.PipelineProject(
      this,
      "BuildImageAppEcrImage",
      {
        projectName: "BuildImageAppEcrImage",
        role: codebuildRole,
        environment: {
          privileged: true,
          buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: aws_codebuild.ComputeType.MEDIUM,
          environmentVariables: {
            ACCOUNT_ID: {
              value: this.account,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REGION: {
              value: this.region,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            REPO_NAME: {
              value: props.ecrRepoName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            APP_NAME: {
              value: props.appName,
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
            TAG: {
              value: "demo",
              type: aws_codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            },
          },
        },

        // cdk upload build_spec.yaml to s3
        buildSpec: aws_codebuild.BuildSpec.fromAsset(
          path.join("buildspec", "./build_spec_image_app.yaml")
        ),
      }
    );

    // code pipeline
    new aws_codepipeline.Pipeline(this, "CodePipelineImageApp", {
      pipelineName: "CodePipelineImageApp",
      // cdk automatically creates role for codepipeline
      // role: pipelineRole,
      stages: [
        // source
        {
          stageName: "SourceCode",
          actions: [
            // new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            //   actionName: "GitHub",
            //   owner: props.repoOwner,
            //   repo: props.repoName,
            //   branch: props.repoBranch,
            //   connectionArn: props.connectArn,
            //   output: sourceOutput,
            // }),

            new aws_codepipeline_actions.CodeCommitSourceAction({
              actionName: "CodeCommitImageApp",
              repository: codecommitRepository,
              branch: "main",
              output: sourceOutput,
            }),
          ],
        },

        // build docker image and push to ecr
        {
          stageName: "BuildImageAppEcrImageStage",
          actions: [
            new aws_codepipeline_actions.CodeBuildAction({
              actionName: "BuildImageAppEcrImage",
              project: ecrBuild,
              input: sourceOutput,
              outputs: [codeBuildOutput],
            }),
          ],
        },

        // deploy new tag image to ecs service
        // {
        //   stageName: "EcsCodeDeploy",
        //   actions: [
        //     new aws_codepipeline_actions.EcsDeployAction({
        //       // role: pipelineRole,
        //       actionName: "Deploy",
        //       service: props.service,
        //       input: codeBuildOutput,
        //       // imageFile: codeBuildOutput.atPath(""),
        //       deploymentTimeout: Duration.minutes(10),
        //     }),
        //   ],
        // },
      ],
    });
  }
}
