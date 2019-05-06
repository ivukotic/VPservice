import os
import sys
from glob import glob
import struct
import time
from datetime import datetime
import requests

filename = 'AOD.17664353._023646.pool.root.1.cinfo'

fin = open(filename, "rb")

_, = struct.unpack('i', fin.read(4))
print("file version:", _)
bs, = struct.unpack('q', fin.read(8))
print('bucket size:', bs)
fs, = struct.unpack('q', fin.read(8))
print('file size:', fs)

buckets = int((fs - 1) / bs + 1)
print('buckets:', buckets)

StateVectorLengthInBytes = int((buckets - 1) / 8 + 1)
sv = struct.unpack(str(StateVectorLengthInBytes) + 'B', fin.read(StateVectorLengthInBytes))
print('disk written state vector:\n ->', sv, '<-')

chksum, = struct.unpack('16s', fin.read(16))
print('chksum:', chksum)

time_of_creation, = struct.unpack('Q', fin.read(8))
print('time of creation:', datetime.fromtimestamp(time_of_creation))

accesses, = struct.unpack('Q', fin.read(8))
print('accesses:', accesses)

min_access = max(0, accesses - 20)
for a in range(min_access, accesses):
    attach_time, = struct.unpack('Q', fin.read(8))
    detach_time, = struct.unpack('Q', fin.read(8))
    bytes_disk, = struct.unpack('q', fin.read(8))
    bytes_ram, = struct.unpack('q', fin.read(8))
    bytes_missed, = struct.unpack('q', fin.read(8))
    print('access:', a, 'attached at:', datetime.fromtimestamp(attach_time), 'detached at:', datetime.fromtimestamp(
        detach_time), 'bytes disk:', bytes_disk, 'bytes ram:', bytes_ram, 'bytes missed:', bytes_missed)
