FROM rucio/rucio-clients:latest

LABEL maintainer Ilija Vukotic <ivukotic@cern.ch>

# Create app directory
WORKDIR /usr/src/app

COPY . .

RUN python -m pip install -r requirements.txt

CMD [ "sleep","1000000" ]