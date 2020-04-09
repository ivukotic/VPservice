# get all keys
redis-cli  keys \* > keys.txt

while read key; do
  echo "Key: $key"
  redis-cli lrange $key 0 5 >> values.txt;
done < keys.txt
