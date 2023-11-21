---
title: observability with prometheus and grafana
description: observability with prometheus and grafana
author: haimtran
publishedDate: 13/08/2023
date: 2022-13-08
---

## Summary

This section walk through steps to step up Prometheus

- Prometheus components and methods to setup
- Setup the EBS CSI Driver add-on with service account [here](https://cdk.entest.io/eks/service-account)
- Setup Prometheus and Grafana using helm chart

> Double check the node role which has permission to create EBS

> [!IMPORTANT]  
> A shortcut is attach the AmazonEBSCSIDriverPolicy policy to EC2 node instead of using service account

### Section 1. Components of Prometheus

Check [docs](https://prometheus.io/docs/introduction/overview/)

- Prometheus server
- Alert manager
- Pushgateway
- Node exporter
- PromQL, PrometheusUI, Grafana, API Clients

### Section 2. Setup Prometheus

There are several ways to setup monitoring with Prometheus, please read [docs](https://prometheus-operator.dev/docs/user-guides/getting-started/).

- [Prometheus-community helm chart ](https://github.com/prometheus-community/helm-charts/tree/main)
- [Kube-prometheus ](https://github.com/prometheus-operator/kube-prometheus)
- [Prometheus operator](https://github.com/prometheus-operator)

The easiest way is to use Prometheus community helm chart. First, add the repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```

List charts from the repository

```bash
helm search repo prometheus-community
```

Then install the Prometheus community helm chart with custom configuration

```bash
helm install my-prometheus prometheus-community/prometheus -f ./test/prometheus_values.yaml
```

There are two methods for metric collectioin configuration

- Via ServiceMonitor and PodMonitor in Prometheus Operator [HERE](https://github.com/prometheus-operator/prometheus-operator/blob/main/Documentation/user-guides/getting-started.md)
- Via scrape_configs in prometheus.yaml [HERE](https://www.cncf.io/blog/2021/10/25/prometheus-definitive-guide-part-iii-prometheus-operator/)

Forward port to see Prometheus server UI

```bash
kubectl port-forward deploy/prometheus-server 8080:9090 -n prometheus
```

First query with Prometheus

```sql
sum by (namespace) (kube_pod_info)
```

### Section 3. Prometheus and Granfana

To install both Prometheus and Grafana, choose another release

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/kube-prometheus-stack -f ./test/prometheus_values.yaml
```

Then port-forward to login the Grafana UI

```bash
kubectl port-forward deploy/prometheus-grafana 8081:3000 -n prometheus
```

without namespace

```bash
kubectl port-forward deploy/prometheus-grafana 8081:3000
```

Find the password to login Grafana

```bash
kubectl get secret --namespace prometheus prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

Login Grafana UI, and go to the menu button, find

- Dashboard and select Kubernetes/Compute Resources/ Pod and see
- Explore, select code, and query with PromQL

## Sample Query

CPU usage by POD

```bash
sum(rate(container_cpu_usage_seconds_total{image!=""}[1m]))by(pod)
```

## Troubleshotting

Kill binding port

```bash
lsof -ti:PORT_NUMBER
```

Then kill the processing running on the port

```bash
sudo kill -9 PROCESS_NUMBER
```

## Reference
