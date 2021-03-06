// this code maps filename hash space to storage servers in
// such a way that adding/removing a server would preserve most of the
// existing hash-server associations.

const Fraction = require('fractions');
const hash = require('hash-sum');

const MAX_HASH = 2 ** 32;

class Cluster {
  constructor(servers) {
    this.servers = servers;
    this.Ranges = [];
    this.calculateFractions();
  }

  calculateFractions() {
    const res = [[[0, new Fraction(1, 1)]]]; // server index, fraction
    for (let i = 1; i < this.servers.length; i++) {
      console.log('server >>>>>', i);
      const rn = [];
      const fractionToSubtract = {};
      for (let si = 0; si < i; si++) {
        fractionToSubtract[si] = new Fraction(1, i * (i + 1));
      }
      // console.log('to subtract per server:', fractionToSubtract);

      // take a part from each previous server.
      res[i - 1].forEach((piece) => {
        // console.log('starting:', piece);
        const si = piece[0];
        const fr = piece[1];

        if (!(fr > fractionToSubtract[si])) {
          // console.log('giving it all to new server')
          rn.push([i, fr]);
          fractionToSubtract[si] -= fr;
          // Fraction.subtract(fractionToSubtract[si], fr); XXX
        } else {
          if (si % 2) { // makes similar parts sit together
            // rewriting old one but now its fraction decreases
            rn.push([si, Fraction.subtract(fr, fractionToSubtract[si])]);
            // adding new one
            rn.push([i, fractionToSubtract[si]]);
          } else {
            rn.push([i, fractionToSubtract[si]]);
            rn.push([si, Fraction.subtract(fr, fractionToSubtract[si])]);
          }
          fractionToSubtract[si] = new Fraction(0, 1);
        }
      });
      // console.log('RN:', rn);

      // connect pieces siting next to each other
      const r = [];
      let p = [-1, new Fraction(1, 1)];
      rn.forEach((j) => {
        if (j[0] !== p[0]) {
          r.push(j);
        } else {
          r[r.length - 1] = [j[0], Fraction.add(j[1], p[1])];
        }
        p = j;
      });
      console.log(r);
      res.push(r);
    }

    let ul = 0;
    const f = res[res.length - 1];
    f.forEach((i) => {
      ul += i[1];
      this.Ranges.push([i[0], ul]);
    });
    // console.log('================================');
    // console.log('fractions:', f);
    console.log('ranges:', this.Ranges);
  }

  getServer(filename) {
    const h = parseInt(hash(filename), 16) / MAX_HASH;
    // console.log(h, this.Ranges);
    for (let i = 0; i < this.Ranges.length; i++) {
      if (h < this.Ranges[i][1]) {
        // console.log(`hash:${h} server:${this.Ranges[i][0]}`);
        return this.servers[this.Ranges[i][0]][0];
      }
    }
    return null;
  }
}

function test() {
  const C = new Cluster([['a1.edu', 123], ['a2.edu', 321]]);
  console.log(C.getServer('asd.root'));
}

exports.Cluster = Cluster;
exports.test = test;
