FROM rucio/rucio-clients:latest

LABEL maintainer Ilija Vukotic <ivukotic@cern.ch>


RUN yum -y update

RUN curl -s -o /etc/pki/rpm-gpg/RPM-GPG-KEY-wlcg http://linuxsoft.cern.ch/wlcg/RPM-GPG-KEY-wlcg; \
    curl -s -o /etc/yum.repos.d/wlcg-centos7.repo http://linuxsoft.cern.ch/wlcg/wlcg-centos7.repo;

RUN yum install -y  wlcg-voms-atlas

# Create app directory
WORKDIR /usr/src/app

COPY . .

RUN python -m pip install -r requirements.txt

CMD [ "sleep","1000000" ]