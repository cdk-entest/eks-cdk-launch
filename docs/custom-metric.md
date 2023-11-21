---
title: eks ci/cd pipeline with flux
description: eks ci/cd pipeline with flux
author: haimtran
publishedDate: 13/08/2023
date: 2022-13-08
---

## Introduction

[GitHub](https://github.com/entest-hai/eks-flux-demo) this note how to getting started with a CI/CD pipeline for EKS using Flux.

- Prometheus metric format in Kubernetes
- Application emit custom metrics
- Custom metric API and HPA scaling
- Setup Flux on EKS
- Monitor ECR image
- [Flask polly app](https://github.com/entest-hai/flask-polly-app)

![custom-metric-scale](./../assets/custom-metric-scale.png)

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
  --repository=eks-custom-metric-demo \
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
  --repository=eks-flux-demo-1 \
  --branch=main \
  --path=clusters/EksClusterLevel1 \
  --read-write-key \
  --personal
```

Project structure

```txt

```

Should change the repository name

```bash
flux-image-updates => eks-flux-demo
```

Add an yaml file such as an flask-app.yaml, please specify namespace

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flask-app-deployment
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: flask-app
  template:
    metadata:
      labels:
        app: flask-app
    spec:
      containers:
        - image: 392194582387.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app:latest
          name: flask-app
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: 50m
            requests:
              cpu: 50m
```

Then wait a minute or run

```bash
flux reconcile kustomization flux-system --with-source
```

and

```bash
flux reconcile helmrelease prometheus-adapter -n monitoring-system
```

and

```bash
flux reconcile helmrelease metrics-server -n monitoring-system
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

## HPA Customer Metric

Exect into a busy box and test the service

```bash
 kubectl run test --image=busybox -it --rm --command -- /bin/sh
```

and call the service

```bash
wget -O- http://podinfo.demo-metric
```

Install and run load test with hey

```bash
hey -z 10m -c 5 -q 5 -disable-keepalive http://podinfo.demo-metric
```

Watch HPA result

```bash
watch kubectl -n demo get hpa
```

Describe hpa to see result of scaling hpa

```bash
kubectl -n demo-metric describe hpa podinfo
```

## Metrics Server

```bash
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
```

and

```bash
helm upgrade --install metrics-server metrics-server/metrics-server
```

Install custom-metric manually with below yaml into monitoring-system namespace

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  labels:
    k8s-app: metrics-server
  name: metrics-server
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  labels:
    k8s-app: metrics-server
    rbac.authorization.k8s.io/aggregate-to-admin: "true"
    rbac.authorization.k8s.io/aggregate-to-edit: "true"
    rbac.authorization.k8s.io/aggregate-to-view: "true"
  name: system:aggregated-metrics-reader
rules:
  - apiGroups:
      - metrics.k8s.io
    resources:
      - pods
      - nodes
    verbs:
      - get
      - list
      - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  labels:
    k8s-app: metrics-server
  name: system:metrics-server
rules:
  - apiGroups:
      - ""
    resources:
      - nodes/metrics
    verbs:
      - get
  - apiGroups:
      - ""
    resources:
      - pods
      - nodes
    verbs:
      - get
      - list
      - watch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  labels:
    k8s-app: metrics-server
  name: metrics-server-auth-reader
  namespace: kube-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: extension-apiserver-authentication-reader
subjects:
  - kind: ServiceAccount
    name: metrics-server
    namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  labels:
    k8s-app: metrics-server
  name: metrics-server:system:auth-delegator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: metrics-server
    namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  labels:
    k8s-app: metrics-server
  name: system:metrics-server
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:metrics-server
subjects:
  - kind: ServiceAccount
    name: metrics-server
    namespace: kube-system
---
apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: metrics-server
  name: metrics-server
  namespace: kube-system
spec:
  ports:
    - name: https
      port: 443
      protocol: TCP
      targetPort: https
  selector:
    k8s-app: metrics-server
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    k8s-app: metrics-server
  name: metrics-server
  namespace: kube-system
spec:
  selector:
    matchLabels:
      k8s-app: metrics-server
  strategy:
    rollingUpdate:
      maxUnavailable: 0
  template:
    metadata:
      labels:
        k8s-app: metrics-server
    spec:
      containers:
        - args:
            - --cert-dir=/tmp
            - --secure-port=4443
            - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
            - --kubelet-use-node-status-port
            - --metric-resolution=15s
          image: registry.k8s.io/metrics-server/metrics-server:v0.6.3
          imagePullPolicy: IfNotPresent
          livenessProbe:
            failureThreshold: 3
            httpGet:
              path: /livez
              port: https
              scheme: HTTPS
            periodSeconds: 10
          name: metrics-server
          ports:
            - containerPort: 4443
              name: https
              protocol: TCP
          readinessProbe:
            failureThreshold: 3
            httpGet:
              path: /readyz
              port: https
              scheme: HTTPS
            initialDelaySeconds: 20
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 200Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
          volumeMounts:
            - mountPath: /tmp
              name: tmp-dir
      nodeSelector:
        kubernetes.io/os: linux
      priorityClassName: system-cluster-critical
      serviceAccountName: metrics-server
      volumes:
        - emptyDir: {}
          name: tmp-dir
---
apiVersion: apiregistration.k8s.io/v1
kind: APIService
metadata:
  labels:
    k8s-app: metrics-server
  name: v1beta1.metrics.k8s.io
spec:
  group: metrics.k8s.io
  groupPriorityMinimum: 100
  insecureSkipTLSVerify: true
  service:
    name: metrics-server
    namespace: kube-system
  version: v1beta1
  versionPriority: 100
```

## Troubleshooting

```bash
flux get all -A --status-selector ready=false
```

and

```bash
flux reconcile kustomization flux-system --with-source
```

and

```bash
flux reconcile helmrelease prometheus-adapter -n monitoring-system
```

and

```bash
flux reconcile helmrelease metrics-server -n monitoring-system
```

get customr metric scrape by prometheus

```bash
watch kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1 | jq .
```

watch hpa with custom metric

```bash
watch kubectl -n demo get hpa
```

describe hpa to see result of scaling hpa

```bash
 kubectl -n demo-metric describe hpa podinfo
```

## Flux

Delete source git

```bash
flux delete source git
```

Uninstall Flux

```bash
flux uninstall --namespace=flux-system
```

## Reference

- [install flux](https://fluxcd.io/flux/installation/#install-the-flux-cli)

- [install eksctl](https://eksctl.io/installation/)

- [aws gitops with flux](https://aws.amazon.com/blogs/containers/building-a-gitops-pipeline-with-amazon-eks/)

- [flux docs](https://fluxcd.io/flux/guides/image-update/)

- [example flux docs](https://fluxcd.io/flux/guides/image-update/)

- [aws gitops with flux readme](https://github.com/weaveworks/guestbook-gitops/tree/master)

- [image policy flux](https://fluxcd.io/flux/guides/image-update/#imagepolicy-examples)
