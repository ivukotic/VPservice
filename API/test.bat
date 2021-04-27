REM npm install -g newman

curl  https://api.getpostman.com/collections?apikey=PMAK-6022b774b02caa003169eeff-882b8d01336f55a07dbf7139e2ddd16838 > collections.json

curl  https://api.getpostman.com/collections/dcc9bb4e-66d1-4634-8879-252c17692ce0?apikey=PMAK-6022b774b02caa003169eeff-882b8d01336f55a07dbf7139e2ddd16838 > bad_requests.json

newman run -k^
 -e vps.cern.ch.postman_environment.json^
 --postman-api-key PMAK-6022b774b02caa003169eeff-882b8d01336f55a07dbf7139e2ddd16838^
 bad_requests.json
 