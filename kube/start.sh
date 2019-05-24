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
#  kubectl create secret generic cert-secret --from-file=key=secrets/certificates/vps.key.pem --from-file=cert=secrets/certificates/vps.cert.cer
kubectl create secret generic config --from-file=conf=config.json

echo "Start redis"
kubectl create -f redis.yaml 
kubectl create -f redis-slave.yaml

echo "Deploying filler and server"
kubectl create -f filler.yaml
kubectl create -f frontend.cern.yaml