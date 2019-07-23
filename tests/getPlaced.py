keys = open("keys.txt", "r").readlines
values = open("values.txt", "r").readlines

count = 0
placed = 0
for count in len(keys):
    if values[count] != 'other':
        print(keys[count], values[count])
        placed += 1
    count += 1

print('total', count, 'placed', placed)
