artillery quick --num 10000 --count 500 "https:/kube.entest.io"
# kubectl get hpa book-app-hpa --watch 
# kubectl top pod -n default 
# kubectl top node 
# kubectl -n kube-system logs -f deployment.apps/cluster-autoscaler
# kubectl rollout restart deployment/flask-app-deployment