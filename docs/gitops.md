---
title: eks ci/cd pipeline with flux
description: eks ci/cd pipeline with flux
author: haimtran
publishedDate: 13/08/2023
date: 2022-13-08
---

## Introduction

[GitHub](https://github.com/entest-hai/eks-flux-demo) this note how to getting started with a CI/CD pipeline for EKS using Flux.

- Setup Flux on EKS
- Monitor ECR image
- [Flask polly app](https://github.com/entest-hai/flask-polly-app)

## Install Flux

Let install flux

```bash
curl -s https://fluxcd.io/install.sh | sudo bash
```

Check the environment

```bash
flux check --pre
```

Setup GitHub connection with Flux

```bash
export GITHUB_TOKEN=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
export GITHUB_USER=entest-hai
```

Boostrap Flux into the EKS cluster

```bash
flux bootstrap github \
  --components-extra=image-reflector-controller,image-automation-controller \
  --owner=$GITHUB_USER \
  --repository=eks-flux-demo \
  --branch=main \
  --path=clusters/EksClusterLevel1 \
  --read-write-key \
  --personal
```

Example

```bash
flux bootstrap github \
  --components-extra=image-reflector-controller,image-automation-controller \
  --owner=$GITHUB_USER \
  --repository=eks-flux-demo-2 \
  --branch=main \
  --path=clusters/EksClusterLevel1 \
  --read-write-key \
  --personal
```

Should change the repository name

```bash
flux-image-updates => eks-flux-demo
```

Add an yaml file such as an flask-app.yaml, please specify namespace

<details>
<summary>flask-app.yaml</summary>

```yaml
apiVersion: v1
kind: Service
metadata:
  name: book-app-service
  namespace: default
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: http
    service.beta.kubernetes.io/aws-load-balancer-ssl-cert: arn:aws:acm:ap-southeast-1:575808125544:certificate/61d3f411-eba3-48dd-bb9a-fbea3481fc17
    service.beta.kubernetes.io/aws-load-balancer-ssl-ports: https
spec:
  ports:
    - port: 80
      targetPort: 8080
      name: http
    - port: 443
      targetPort: 8080
      name: https
  selector:
    app: book-app
  type: LoadBalancer
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: book-app-deployment
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: book-app
  template:
    metadata:
      labels:
        app: book-app
    spec:
      containers:
        - image: 575808125544.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app:d813066a06b2933fd2d33c1223a97ce843633046-1700467645
          name: book-app
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: 1
            requests:
              cpu: 1
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: book-app-hpa
  namespace: default
spec:
  maxReplicas: 1000
  metrics:
    - resource:
        name: cpu
        target:
          averageUtilization: 5
          type: Utilization
      type: Resource
  minReplicas: 2
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: book-app-deployment
```

</details>

Then wait a minute or run

```bash
flux reconcile kustomization flux-system --with-source
```

Check the update by flux

```bash
watch flux get kustomizations
```

## Scan Image

Basically, flux will scan ECR image for tags and update the flask-app.yaml with the new tags. Then flux will deploy the updated flask-app.yaml

- Register ecr image
- Create ecr credentials
- Create image update policy

Check the image tag which is using now by the flask-app service

```bash
kubectl get deployment/flask-app-deployment -oyaml | grep 'image:'
```

First, we need to create ImageRepository to tell Flux which container registry to scan for

```bash
flux create image repository flask-app \
--image=$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app \
--interval=1m \
--export > ./clusters/EksClusterLevel1/flask-app-registry.yaml
```

and the generated yaml

```yaml
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: flask-app
  namespace: flux-system
spec:
  image: $ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app
  interval: 1m0s
```

Second, we need grant permissiosn so Flux can scan ecr images by updaing the flux-system/kustomization.yaml

```bash
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - gotk-components.yaml
  - gotk-sync.yaml
patches:
  - patch: |-
      - op: add
        path: /spec/template/spec/containers/0/args/-
        value: --aws-autologin-for-ecr
    target:
      version: v1
      group: apps
      kind: Deployment
      name: image-reflector-controller
      namespace: flux-system
```

Third, create an ImagePolicy to tell Flux which semver range to use when filtering tags

```bash
flux create image policy flask-app \
--image-ref=flask-app \
--select-semver=5.0.x \
--export > ./clusters/EksClusterLevel1/flask-app-policy.yaml
```

and the generated yaml

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: flask-app
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: flask-app
  policy:
    semver:
      range: 5.0.x
```

Finally, we need to create ImageUpdateAutomation

```bash
flux create image update flux-system \
--interval=30m \
--git-repo-ref=flux-system \
--git-repo-path="./clusters/EksClusterLevel1" \
--checkout-branch=main \
--push-branch=main \
--author-name=fluxcdbot \
--author-email=fluxcdbot@users.noreply.github.com \
--commit-template="{{range .Updated.Images}}{{println .}}{{end}}" \
--export > ./clusters/EksClusterLevel1/flux-system-automation.yaml
```

and the generated yaml

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageUpdateAutomation
metadata:
  name: flux-system
  namespace: flux-system
spec:
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        email: hai@entest.io
        name: fluxcdbot
      messageTemplate: "{{range .Updated.Images}}{{println .}}{{end}}"
    push:
      branch: main
  interval: 1m0s
  sourceRef:
    kind: GitRepository
    name: flux-system
  update:
    path: ./clusters/EksClusterLevel1
    strategy: Setters
```

## Troubleshooting

Check image tag of a deployment

```bash
kubectl get deployment/flask-app-deployment -oyaml | grep 'image:'
```

Get image repository

```bash
flux get image repository flask-app
```

Or describe

```bash
kubectl -n flux-system describe imagerepositories podinfo
```

Get all image of a namespace

```bash
flux get images all --all-namespaces
```

## Reference

- [install flux](https://fluxcd.io/flux/installation/#install-the-flux-cli)

- [aws gitops with flux](https://aws.amazon.com/blogs/containers/building-a-gitops-pipeline-with-amazon-eks/)

- [flux docs](https://fluxcd.io/flux/guides/image-update/)

- [example flux docs](https://fluxcd.io/flux/guides/image-update/)

- [aws gitops with flux readme](https://github.com/weaveworks/guestbook-gitops/tree/master)

- [image policy flux](https://fluxcd.io/flux/guides/image-update/#imagepolicy-examples)
