artillery quick --num 10000 --count 500 "http://a31e17337e6aa46debf7fa481f64966f-1676812520.us-east-1.elb.amazonaws.com/"
# kubectl get hpa book-app-hpa --watch 
# kubectl top pod -n default 
# kubectl top node 
# kubectl -n kube-system logs -f deployment.apps/cluster-autoscaler
# kubectl rollout restart deployment/book-app-deployment