FROM rucio/rucio-clients:latest

LABEL maintainer Ilija Vukotic <ivukotic@cern.ch>

# RUN whoami

USER root
RUN yum -y update

RUN yum install -y https://repo.opensciencegrid.org/osg/3.5/osg-3.5-el7-release-latest.rpm

RUN curl -s -o /etc/pki/rpm-gpg/RPM-GPG-KEY-wlcg http://linuxsoft.cern.ch/wlcg/RPM-GPG-KEY-wlcg; \
    curl -s -o /etc/yum.repos.d/wlcg-centos7.repo http://linuxsoft.cern.ch/wlcg/wlcg-centos7.repo;

RUN yum install -y  wlcg-voms-atlas osg-ca-certs

# Create app directory
WORKDIR /usr/src/app
RUN mkdir -p /opt/rucio/etc/

COPY *.py /usr/src/app/
COPY start.sh requirements.txt /usr/src/app/
COPY rucio.cfg  /opt/rucio/etc/

RUN python3 -m pip install -r requirements.txt

CMD [ "/usr/src/app/start.sh" ]