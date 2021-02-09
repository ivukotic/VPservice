REM deleting everything

kubectl delete -f filler.yaml
kubectl delete -f frontend.yaml
kubectl delete -f redis.yaml 
kubectl delete secret config
kubectl delete secret es-conn

REM creating secrets
kubectl create secret generic config --from-file=config.json=config.json
kubectl create secret generic es-conn --from-file=secrets/es-conn.json
kubectl create secret generic tokens --from-file=secrets/tokens.json

REM create svc
kubectl create -f loadbalancer.yaml

REM creating services
kubectl create -f redis.yaml 
kubectl create -f filler.yaml
kubectl create -f frontend.yaml


START /B kubectl port-forward service/vps 80:80