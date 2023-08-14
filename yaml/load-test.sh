artillery quick --num 10000 --count 500 "http:/a60fd4effcfc14f96a5e65e007a3d3de-304452142.ap-southeast-1.elb.amazonaws.com"
# kubectl get hpa book-app-hpa --watch 
# kubectl top pod -n default 
# kubectl top node 
# kubectl -n kube-system logs -f deployment.apps/cluster-autoscaler
# kubectl rollout restart deployment/flask-app-deployment