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

# ClusterName=EksClusterLevel1
# REGION=ap-southeast-1
# curl https://raw.githubusercontent.com/aws-observability/aws-otel-collector/main/deployment-template/eks/otel-fargate-container-insights.yaml | sed 's/YOUR-EKS-CLUSTER-NAME/'${ClusterName}'/;s/us-east-1/'${Region}'/' | kubectl apply -f - 
