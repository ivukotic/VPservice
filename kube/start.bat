
echo "Adding site certs"
kubectl create secret generic cert-secret --from-file=key=secrets/certificates/vps.key.pem --from-file=cert=secrets/certificates/vps.cert.cer
kubectl create secret generic config --from-file=conf=config.json

echo "Deploying filler and server"

kubectl create -f filler.yaml
kubectl create -f frontend.yaml