echo "create volume for redis if not already there"
openstack volume create --size 100 vps

echo "volume id should be given to redis.yaml deployment"

echo "try deleting all of the components."

kubectl delete -f filler.yaml
kubectl delete -f frontend.yaml
kubectl delete -f redis.yaml 
kubectl delete secret config
kubectl delete secret es-conn

echo "create secrets"
kubectl create secret generic config --from-file=config.json=config.json
kubectl create secret generic es-conn --from-file=es-conn.json=secrets/es-conn.json

echo "Start redis"
kubectl create -f redis.yaml 
# kubectl create -f redis-slave.yaml

echo "Deploying filler and server"
kubectl create -f filler.yaml
kubectl create -f frontend.yaml

!!! For the ingress to work k8s nodes need to be labeled eg.
kubectl label node vpservice-svulyholph5g-minion-1 role=ingress 
!!! To remove label
kubectl label node vpservice-svulyholph5g-minion-1 role-

kubectl label node vpservice-svulyholph5g-minion-0 vps=true

and this has to be done for cluster nodes that will be exposed:
openstack server set --property landb-alias=vpservice--load-1- vpservice-svulyholph5g-master-0
