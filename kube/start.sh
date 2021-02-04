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
kubectl create secret generic cert --from-file=secrets/certificates/tls.key --from-file=secrets/certificates/tls.crt

echo "create loadbalancer"
kubectl create -f loadbalancer.yaml

echo "Start redis"
kubectl create -f redis.yaml 
# kubectl create -f redis-slave.yaml

echo "Deploying filler and server"
kubectl create -f filler.yaml
kubectl create -f frontend_new.yaml

echo "to give a dns"
export OS_REGION_NAME=sdn1
openstack loadbalancer list
echo "Set dns name"
openstack loadbalancer set --description vps kube_service_xxxxxxxx