echo "try deleting all the data if service is running"
curl -X DELETE vpservice.cern.ch/all_data

echo "try deleting all of the components."
kubectl delete -f filler.yaml
kubectl delete -f frontend.cern.yaml
# kubectl delete secret cert-secret
kubectl delete secret config
kubectl delete -f redis.yaml 
kubectl delete -f redis-slave.yaml

echo "Adding site certs"
kubectl create secret generic config --from-file=conf=config.json
kubectl create secret generic es-conn --from-file=es-conf=secrets/es_conn.json

echo "Start redis"
kubectl create -f redis.yaml 
kubectl create -f redis-slave.yaml

echo "Deploying filler and server"
kubectl create -f filler.yaml
kubectl create -f frontend.cern.yaml

!!! For the ingress to work k8s nodes need to be labeled eg.
kubectl label node vpservice-svulyholph5g-minion-1 role=ingress 

and this has to be done for cluster nodes that will be exposed:
openstack server set --property landb-alias=vpservice--load-1- vpservice-svulyholph5g-master-0