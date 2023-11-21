---
title: observability in amazon eks
author: haimtran
descripton: observability in amazon eks
publishedDate: 10/11/2023
date: 10/11/2023
---

## Introduction

Explore multiple solutions for observability in Amazon EKS

- CloudWatch agent and fluent bit
- ADOT collector for fargate profile

## CloudWatch Agent and Fluent Bit

> [!IMPORTANT]  
> If you are installing Container Insights on an Amazon EKS cluster, we recommend that you use the Amazon CloudWatch Observability EKS add-on for the installation, instead of using the instructions in this section

Alternatively, it is possible to install as add-on or using yaml files as the following

- CloudWatch Agent to collect metrics
- Fluent Bit to send logs to CW Logs

This command will download template yaml and replace some argument

```bash
ClusterName=<my-cluster-name>
RegionName=<my-cluster-region>
FluentBitHttpPort='2020'
FluentBitReadFromHead='Off'
[[ ${FluentBitReadFromHead} = 'On' ]] && FluentBitReadFromTail='Off'|| FluentBitReadFromTail='On'
[[ -z ${FluentBitHttpPort} ]] && FluentBitHttpServer='Off' || FluentBitHttpServer='On'
curl https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluent-bit-quickstart-enhanced.yaml | sed 's/{{cluster_name}}/'${ClusterName}'/;s/{{region_name}}/'${RegionName}'/;s/{{http_server_toggle}}/"'${FluentBitHttpServer}'"/;s/{{http_server_port}}/"'${FluentBitHttpPort}'"/;s/{{read_from_head}}/"'${FluentBitReadFromHead}'"/;s/{{read_from_tail}}/"'${FluentBitReadFromTail}'"/' | kubectl apply -f -
```

We can download only the template yaml file and setup arguments from [this repository](https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluent-bit-quickstart-enhanced.yaml)

```bash
wget https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluent-bit-quickstart-enhanced.yaml
```

<details>
<summary>cloudwatch-agent-fluent-bit.yaml</summary>

```yaml
# create amazon-cloudwatch namespace
apiVersion: v1
kind: Namespace
metadata:
  name: amazon-cloudwatch
  labels:
    name: amazon-cloudwatch
---
# create cwagent service account and role binding
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cloudwatch-agent
  namespace: amazon-cloudwatch

---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: cloudwatch-agent-role
rules:
  - apiGroups: [""]
    resources: ["pods", "nodes", "endpoints"]
    verbs: ["list", "watch"]
  - apiGroups: ["apps"]
    resources: ["replicasets", "daemonsets", "deployments", "statefulsets"]
    verbs: ["list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["list", "watch"]
  - apiGroups: [""]
    resources: ["nodes/proxy"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["nodes/stats", "configmaps", "events"]
    verbs: ["create"]
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["cwagent-clusterleader"]
    verbs: ["get", "update"]
  - nonResourceURLs: ["/metrics"]
    verbs: ["get", "list", "watch"]

---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: cloudwatch-agent-role-binding
subjects:
  - kind: ServiceAccount
    name: cloudwatch-agent
    namespace: amazon-cloudwatch
roleRef:
  kind: ClusterRole
  name: cloudwatch-agent-role
  apiGroup: rbac.authorization.k8s.io
---
# create configmap for cwagent config
apiVersion: v1
data:
  # Configuration is in Json format. No matter what configure change you make,
  # please keep the Json blob valid.
  cwagentconfig.json: |
    {
      "agent": {
        "region": "{{region_name}}"
      },
      "logs": {
        "metrics_collected": {
          "kubernetes": {
            "cluster_name": "{{cluster_name}}",
            "metrics_collection_interval": 60,
            "enhanced_container_insights": true
          }
        },
        "force_flush_interval": 5
      }
    }
kind: ConfigMap
metadata:
  name: cwagentconfig
  namespace: amazon-cloudwatch
---
# deploy cwagent as daemonset
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: cloudwatch-agent
  namespace: amazon-cloudwatch
spec:
  selector:
    matchLabels:
      name: cloudwatch-agent
  template:
    metadata:
      labels:
        name: cloudwatch-agent
    spec:
      containers:
        - name: cloudwatch-agent
          image: public.ecr.aws/cloudwatch-agent/cloudwatch-agent:1.300030.2b309
          #ports:
          #  - containerPort: 8125
          #    hostPort: 8125
          #    protocol: UDP
          resources:
            limits:
              cpu: 400m
              memory: 400Mi
            requests:
              cpu: 400m
              memory: 400Mi
          # Please don't change below envs
          env:
            - name: HOST_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.hostIP
            - name: HOST_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: K8S_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: CI_VERSION
              value: "k8s/1.3.17"
          # Please don't change the mountPath
          volumeMounts:
            - name: cwagentconfig
              mountPath: /etc/cwagentconfig
            - name: rootfs
              mountPath: /rootfs
              readOnly: true
            - name: dockersock
              mountPath: /var/run/docker.sock
              readOnly: true
            - name: varlibdocker
              mountPath: /var/lib/docker
              readOnly: true
            - name: containerdsock
              mountPath: /run/containerd/containerd.sock
              readOnly: true
            - name: sys
              mountPath: /sys
              readOnly: true
            - name: devdisk
              mountPath: /dev/disk
              readOnly: true
      nodeSelector:
        kubernetes.io/os: linux
      volumes:
        - name: cwagentconfig
          configMap:
            name: cwagentconfig
        - name: rootfs
          hostPath:
            path: /
        - name: dockersock
          hostPath:
            path: /var/run/docker.sock
        - name: varlibdocker
          hostPath:
            path: /var/lib/docker
        - name: containerdsock
          hostPath:
            path: /run/containerd/containerd.sock
        - name: sys
          hostPath:
            path: /sys
        - name: devdisk
          hostPath:
            path: /dev/disk/
      terminationGracePeriodSeconds: 60
      serviceAccountName: cloudwatch-agent

---
# create configmap for cluster name and aws region for CloudWatch Logs
# need to replace the placeholders {{cluster_name}} and {{region_name}}
# and need to replace {{http_server_toggle}} and {{http_server_port}}
# and need to replace {{read_from_head}} and {{read_from_tail}}
apiVersion: v1
data:
  cluster.name: { { cluster_name } }
  logs.region: { { region_name } }
  http.server: { { http_server_toggle } }
  http.port: { { http_server_port } }
  read.head: { { read_from_head } }
  read.tail: { { read_from_tail } }
kind: ConfigMap
metadata:
  name: fluent-bit-cluster-info
  namespace: amazon-cloudwatch
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluent-bit
  namespace: amazon-cloudwatch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fluent-bit-role
rules:
  - nonResourceURLs:
      - /metrics
    verbs:
      - get
  - apiGroups: [""]
    resources:
      - namespaces
      - pods
      - pods/logs
      - nodes
      - nodes/proxy
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: fluent-bit-role-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: fluent-bit-role
subjects:
  - kind: ServiceAccount
    name: fluent-bit
    namespace: amazon-cloudwatch
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: amazon-cloudwatch
  labels:
    k8s-app: fluent-bit
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush                     5
        Grace                     30
        Log_Level                 info
        Daemon                    off
        Parsers_File              parsers.conf
        HTTP_Server               ${HTTP_SERVER}
        HTTP_Listen               0.0.0.0
        HTTP_Port                 ${HTTP_PORT}
        storage.path              /var/fluent-bit/state/flb-storage/
        storage.sync              normal
        storage.checksum          off
        storage.backlog.mem_limit 5M

    @INCLUDE application-log.conf
    @INCLUDE dataplane-log.conf
    @INCLUDE host-log.conf

  application-log.conf: |
    [INPUT]
        Name                tail
        Tag                 application.*
        Exclude_Path        /var/log/containers/cloudwatch-agent*, /var/log/containers/fluent-bit*, /var/log/containers/aws-node*, /var/log/containers/kube-proxy*
        Path                /var/log/containers/*.log
        multiline.parser    docker, cri
        DB                  /var/fluent-bit/state/flb_container.db
        Mem_Buf_Limit       50MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Rotate_Wait         30
        storage.type        filesystem
        Read_from_Head      ${READ_FROM_HEAD}

    [INPUT]
        Name                tail
        Tag                 application.*
        Path                /var/log/containers/fluent-bit*
        multiline.parser    docker, cri
        DB                  /var/fluent-bit/state/flb_log.db
        Mem_Buf_Limit       5MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Read_from_Head      ${READ_FROM_HEAD}

    [INPUT]
        Name                tail
        Tag                 application.*
        Path                /var/log/containers/cloudwatch-agent*
        multiline.parser    docker, cri
        DB                  /var/fluent-bit/state/flb_cwagent.db
        Mem_Buf_Limit       5MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Read_from_Head      ${READ_FROM_HEAD}

    [FILTER]
        Name                kubernetes
        Match               application.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_Tag_Prefix     application.var.log.containers.
        Merge_Log           On
        Merge_Log_Key       log_processed
        K8S-Logging.Parser  On
        K8S-Logging.Exclude Off
        Labels              Off
        Annotations         Off
        Use_Kubelet         On
        Kubelet_Port        10250
        Buffer_Size         0

    [OUTPUT]
        Name                cloudwatch_logs
        Match               application.*
        region              ${AWS_REGION}
        log_group_name      /aws/containerinsights/${CLUSTER_NAME}/application
        log_stream_prefix   ${HOST_NAME}-
        auto_create_group   true
        extra_user_agent    container-insights

  dataplane-log.conf: |
    [INPUT]
        Name                systemd
        Tag                 dataplane.systemd.*
        Systemd_Filter      _SYSTEMD_UNIT=docker.service
        Systemd_Filter      _SYSTEMD_UNIT=containerd.service
        Systemd_Filter      _SYSTEMD_UNIT=kubelet.service
        DB                  /var/fluent-bit/state/systemd.db
        Path                /var/log/journal
        Read_From_Tail      ${READ_FROM_TAIL}

    [INPUT]
        Name                tail
        Tag                 dataplane.tail.*
        Path                /var/log/containers/aws-node*, /var/log/containers/kube-proxy*
        multiline.parser    docker, cri
        DB                  /var/fluent-bit/state/flb_dataplane_tail.db
        Mem_Buf_Limit       50MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Rotate_Wait         30
        storage.type        filesystem
        Read_from_Head      ${READ_FROM_HEAD}

    [FILTER]
        Name                modify
        Match               dataplane.systemd.*
        Rename              _HOSTNAME                   hostname
        Rename              _SYSTEMD_UNIT               systemd_unit
        Rename              MESSAGE                     message
        Remove_regex        ^((?!hostname|systemd_unit|message).)*$

    [FILTER]
        Name                aws
        Match               dataplane.*
        imds_version        v2

    [OUTPUT]
        Name                cloudwatch_logs
        Match               dataplane.*
        region              ${AWS_REGION}
        log_group_name      /aws/containerinsights/${CLUSTER_NAME}/dataplane
        log_stream_prefix   ${HOST_NAME}-
        auto_create_group   true
        extra_user_agent    container-insights

  host-log.conf: |
    [INPUT]
        Name                tail
        Tag                 host.dmesg
        Path                /var/log/dmesg
        Key                 message
        DB                  /var/fluent-bit/state/flb_dmesg.db
        Mem_Buf_Limit       5MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Read_from_Head      ${READ_FROM_HEAD}

    [INPUT]
        Name                tail
        Tag                 host.messages
        Path                /var/log/messages
        Parser              syslog
        DB                  /var/fluent-bit/state/flb_messages.db
        Mem_Buf_Limit       5MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Read_from_Head      ${READ_FROM_HEAD}

    [INPUT]
        Name                tail
        Tag                 host.secure
        Path                /var/log/secure
        Parser              syslog
        DB                  /var/fluent-bit/state/flb_secure.db
        Mem_Buf_Limit       5MB
        Skip_Long_Lines     On
        Refresh_Interval    10
        Read_from_Head      ${READ_FROM_HEAD}

    [FILTER]
        Name                aws
        Match               host.*
        imds_version        v2

    [OUTPUT]
        Name                cloudwatch_logs
        Match               host.*
        region              ${AWS_REGION}
        log_group_name      /aws/containerinsights/${CLUSTER_NAME}/host
        log_stream_prefix   ${HOST_NAME}.
        auto_create_group   true
        extra_user_agent    container-insights

  parsers.conf: |
    [PARSER]
        Name                syslog
        Format              regex
        Regex               ^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$
        Time_Key            time
        Time_Format         %b %d %H:%M:%S

    [PARSER]
        Name                container_firstline
        Format              regex
        Regex               (?<log>(?<="log":")\S(?!\.).*?)(?<!\\)".*(?<stream>(?<="stream":").*?)".*(?<time>\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2}:\d{2}\.\w*).*(?=})
        Time_Key            time
        Time_Format         %Y-%m-%dT%H:%M:%S.%LZ

    [PARSER]
        Name                cwagent_firstline
        Format              regex
        Regex               (?<log>(?<="log":")\d{4}[\/-]\d{1,2}[\/-]\d{1,2}[ T]\d{2}:\d{2}:\d{2}(?!\.).*?)(?<!\\)".*(?<stream>(?<="stream":").*?)".*(?<time>\d{4}-\d{1,2}-\d{1,2}T\d{2}:\d{2}:\d{2}\.\w*).*(?=})
        Time_Key            time
        Time_Format         %Y-%m-%dT%H:%M:%S.%LZ
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: amazon-cloudwatch
  labels:
    k8s-app: fluent-bit
    version: v1
    kubernetes.io/cluster-service: "true"
spec:
  selector:
    matchLabels:
      k8s-app: fluent-bit
  template:
    metadata:
      labels:
        k8s-app: fluent-bit
        version: v1
        kubernetes.io/cluster-service: "true"
    spec:
      containers:
        - name: fluent-bit
          image: public.ecr.aws/aws-observability/aws-for-fluent-bit:stable
          imagePullPolicy: Always
          env:
            - name: AWS_REGION
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: logs.region
            - name: CLUSTER_NAME
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: cluster.name
            - name: HTTP_SERVER
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: http.server
            - name: HTTP_PORT
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: http.port
            - name: READ_FROM_HEAD
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: read.head
            - name: READ_FROM_TAIL
              valueFrom:
                configMapKeyRef:
                  name: fluent-bit-cluster-info
                  key: read.tail
            - name: HOST_NAME
              valueFrom:
                fieldRef:
                  fieldPath: spec.nodeName
            - name: HOSTNAME
              valueFrom:
                fieldRef:
                  apiVersion: v1
                  fieldPath: metadata.name
            - name: CI_VERSION
              value: "k8s/1.3.17"
          resources:
            limits:
              memory: 200Mi
            requests:
              cpu: 500m
              memory: 100Mi
          volumeMounts:
            # Please don't change below read-only permissions
            - name: fluentbitstate
              mountPath: /var/fluent-bit/state
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
            - name: fluent-bit-config
              mountPath: /fluent-bit/etc/
            - name: runlogjournal
              mountPath: /run/log/journal
              readOnly: true
            - name: dmesg
              mountPath: /var/log/dmesg
              readOnly: true
      terminationGracePeriodSeconds: 10
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      volumes:
        - name: fluentbitstate
          hostPath:
            path: /var/fluent-bit/state
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
        - name: fluent-bit-config
          configMap:
            name: fluent-bit-config
        - name: runlogjournal
          hostPath:
            path: /run/log/journal
        - name: dmesg
          hostPath:
            path: /var/log/dmesg
      serviceAccountName: fluent-bit
```

</details>

## ADOT Collector for Fargate

Follow [this docs](https://aws-otel.github.io/docs/getting-started/container-insights/eks-fargate#deploying-adot-collector-to-eks-fargate) to deploy ADOT for Fargate.

First, create a new service account

```bash
##!/bin/bash
CLUSTER_NAME=YOUR-EKS-CLUSTER-NAME
REGION=YOUR-EKS-CLUSTER-REGION
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

Second, download and update [otel-fargate-container-insights.yaml](https://github.com/aws-observability/aws-otel-collector/blob/main/deployment-template/eks/otel-fargate-container-insights.yaml).

Third, deploy a sample app

```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
  namespace: golang
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webapp
      role: webapp-service
  template:
    metadata:
      labels:
        app: webapp
        role: webapp-service
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: go
          image: public.ecr.aws/awsvijisarathy/prometheus-webapp:latest
          imagePullPolicy: Always
          resources:
            requests:
              cpu: "256m"
              memory: "512Mi"
            limits:
              cpu: "512m"
              memory: "1024Mi"
```

Finally, go to CloudWatch and check Container Insight

```bash
kubectl get pods -n fargate-container-insights
kubectl get pods -n golang
```

## Query CW Logs Insights

For example

```json
{
  "time": "2023-11-10T08:17:49.032961134Z",
  "stream": "stderr",
  "_p": "F",
  "log": "192.168.5.73 - - [10/Nov/2023 08:17:49] \"\u001b[31m\u001b[1mPOST / HTTP/1.1\u001b[0m\" 405 -",
  "kubernetes": {
    "pod_name": "flask-app-deployment-f58d7748b-259jv",
    "namespace_name": "demo",
    "pod_id": "aa0ffaa9-7349-4eea-8b30-79ef5233379d",
    "host": "ip-192-168-3-79.ap-southeast-1.compute.internal",
    "container_name": "flask-app",
    "docker_id": "f81a5ea2d7c8550fdbdbf64e3313a8aabea2d6a29e7a2789c156d7574b6503e2",
    "container_hash": "837709072162.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app@sha256:f205c385e202c7c46f44c31ea578268fc2e058b890e00f5cde879b9556b75335",
    "container_image": "837709072162.dkr.ecr.ap-southeast-1.amazonaws.com/flask-app:5.0.6"
  }
}
```

Then query to find log where log begin with a specified IP address

```sql
fields @timestamp, stream, log
| filter log like /^192.168.3.79./
```

Another example with counter

```json
{
  "time": "2023-11-10T09:23:13.804367589Z",
  "stream": "stdout",
  "_p": "F",
  "log": "3834: Fri Nov 10 09:23:13 UTC 2023",
  "kubernetes": {
    "pod_name": "counter",
    "namespace_name": "default",
    "pod_id": "acabeb26-8cf9-4d4c-be0d-5b47076a7b73",
    "host": "ip-192-168-5-73.ap-southeast-1.compute.internal",
    "container_name": "count",
    "docker_id": "a61c21bbf8ca51e75c14b8244169bd6b506c265ab3095b13f43abbef64cb84a5",
    "container_hash": "docker.io/library/busybox@sha256:141c253bc4c3fd0a201d32dc1f493bcf3fff003b6df416dea4f41046e0f37d47",
    "container_image": "docker.io/library/busybox:1.28"
  }
}
```

And query

```sql
fields @timestamp, stream, log, kubernetes.pod_id
| filter kubernetes.pod_id like "acabeb26-8cf9-4d4c-be0d-5b47076a7b73"
```

Here is the counter app

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: counter
spec:
  containers:
    - name: count
      image: busybox:1.28
      args:
        [
          /bin/sh,
          -c,
          'i=0; while true; do echo "$i: $(date)"; i=$((i+1)); sleep 1; done',
        ]
```

## Reference

- [cloudwatch agent and fluent bit](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-EKS-quickstart.html)

- [fluent bit vs fluentd](https://docs.fluentbit.io/manual/about/fluentd-and-fluent-bit)

- [ Amazon CloudWatch Container Insights for Amazon EKS Fargate](https://aws.amazon.com/blogs/containers/introducing-amazon-cloudwatch-container-insights-for-amazon-eks-fargate-using-aws-distro-for-opentelemetry/)

- [cloudwatch container insights knowledge center](https://repost.aws/knowledge-center/cloudwatch-container-insights-eks-fargate)

- [kubernetes application logs](https://kubernetes.io/docs/concepts/cluster-administration/logging/)

- [Centralized Container Logging with Fluent Bit](https://aws.amazon.com/blogs/opensource/centralized-container-logging-fluent-bit/)

- [Capturing logs at scale with Fluent Bit and Amazon EKS](https://aws.amazon.com/blogs/containers/capturing-logs-at-scale-with-fluent-bit-and-amazon-eks/)

- [Fluentd considerations and actions required at scale in Amazon EKS](https://aws.amazon.com/blogs/containers/fluentd-considerations-and-actions-required-at-scale-in-amazon-eks/)

- [Using Prometheus to Avoid Disasters with Kubernetes CPU Limits](https://aws.amazon.com/blogs/containers/using-prometheus-to-avoid-disasters-with-kubernetes-cpu-limits/)

- [Troubleshooting Amazon EKS API servers with Prometheus](https://aws.amazon.com/blogs/containers/troubleshooting-amazon-eks-api-servers-with-prometheus/)

- [Fluentd considerations and actions required at scale in Amazon EKS](https://aws.amazon.com/blogs/containers/fluentd-considerations-and-actions-required-at-scale-in-amazon-eks/)
