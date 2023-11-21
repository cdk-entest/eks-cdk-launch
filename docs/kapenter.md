---
title: scaling cluster with karpenter
author: haimtran
descripton: scaling cluster with karpenter
publishedDate: 10/11/2023
date: 10/11/2023
---

## Karpenter

```bash
helm repo add karpenter https://charts.karpenter.sh
helm repo update
helm upgrade --install --skip-crds karpenter karpenter/karpenter --namespace karpenter \
  --create-namespace --set serviceAccount.create=false --version 0.5.0 \
  --set controller.clusterName=demo \
  --set controller.clusterEndpoint=$(aws eks describe-cluster --name demo --query "cluster.endpoint" --output json) \
  --wait # for the defaulting webhook to install before creating a Provisioner
```

Karpenter provisoner

```yaml
apiVersion: karpenter.sh/v1alpha5
kind: Provisioner
metadata:
name: default
spec:
#Requirements that constrain the parameters of provisioned nodes.
#Operators { In, NotIn } are supported to enable including or excluding values
  requirements:
    - key: "node.kubernetes.io/instance-type" #If not included, all instance types are considered
      operator: In
      values: ["m5.large", "m5.2xlarge"]
    - key: "topology.kubernetes.io/zone" #If not included, all zones are considered
      operator: In
      values: ["us-east-1a", "us-east-1b"]
    - key: "kubernetes.io/arch" #If not included, all architectures are considered
	  operator: In
      values: ["arm64", "amd64"]
    - key: " karpenter.sh/capacity-type" #If not included, the webhook for the AWS cloud provider will default to on-demand
      operator: In
      values: ["spot", "on-demand"]
  provider:
    instanceProfile: KarpenterNodeInstanceProfile-eks-karpenter-demo
  ttlSecondsAfterEmpty: 30
```

## Provisioner

## Reference

- [Karpenter Introduction](https://aws.amazon.com/blogs/aws/introducing-karpenter-an-open-source-high-performance-kubernetes-cluster-autoscaler/)
