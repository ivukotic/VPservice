# get all keys
redis-cli  keys \* > keys.txt

# not needed for cleanup.
while read key; do
  echo "Key: $key"
  redis-cli lrange $key 0 5 >> values.txt;
done < keys.txt
