REM deleting everything

kubectl delete -f filler.yaml
kubectl delete -f frontend.dev.yaml
kubectl delete -f redis.yaml 
kubectl delete secret config
kubectl delete secret es-conn

REM creating secrets
kubectl create secret generic config --from-file=config.json=config.dev.json
kubectl create secret generic es-conn --from-file=es-conn.json=secrets/es-conn.json

REM creating services
kubectl create -f redis.yaml 
kubectl create -f filler.dev.yaml
kubectl create -f frontend.dev.yaml


START /B kubectl port-forward service/vps 80:80