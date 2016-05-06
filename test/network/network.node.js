/* eslint-env mocha */

'use strict'

const libp2p = require('libp2p-ipfs')
const PeerInfo = require('peer-info')
const multiaddr = require('multiaddr')
const expect = require('chai').expect
const PeerBook = require('peer-book')
const Block = require('ipfs-block')

const Network = require('../../src/network')
const Message = require('../../src/message')

describe('network', () => {
  let libp2pNodeA
  let libp2pNodeB
  let peerInfoA
  let peerInfoB
  let peerBookA
  let peerBookB
  let networkA
  let networkB

  before((done) => {
    let counter = 0
    peerInfoA = new PeerInfo()
    peerInfoB = new PeerInfo()

    peerInfoA.multiaddr.add(multiaddr('/ip4/127.0.0.1/tcp/10100'))
    peerInfoB.multiaddr.add(multiaddr('/ip4/127.0.0.1/tcp/10500'))

    peerBookA = new PeerBook()
    peerBookB = new PeerBook()

    peerBookA.put(peerInfoB)
    peerBookB.put(peerInfoA)

    libp2pNodeA = new libp2p.Node(peerInfoA)
    libp2pNodeA.start(started)
    libp2pNodeB = new libp2p.Node(peerInfoB)
    libp2pNodeB.start(started)

    function started () {
      if (++counter === 2) {
        done()
      }
    }
  })

  after((done) => {
    let counter = 0
    libp2pNodeA.swarm.close(stopped)
    libp2pNodeB.swarm.close(stopped)

    function stopped () {
      if (++counter === 2) {
        done()
      }
    }
  })

  let bitswapMockA = {
    _receiveMessage: () => {},
    _receiveError: () => {},
    _onPeerConnected: () => {},
    _onPeerDisconnected: () => {}
  }

  let bitswapMockB = {
    _receiveMessage: () => {},
    _receiveError: () => {},
    _onPeerConnected: () => {},
    _onPeerDisconnected: () => {}
  }

  it('instantiate the network obj', (done) => {
    networkA = new Network(libp2pNodeA, peerBookA, bitswapMockA)
    networkB = new Network(libp2pNodeB, peerBookB, bitswapMockB)
    expect(networkA).to.exist
    expect(networkB).to.exist

    networkA.start()
    networkB.start()
    done()
  })

  it('connectTo fail', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.exist
      done()
    })
  })

  it('onPeerConnected success', (done) => {
    var counter = 0

    bitswapMockA._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoB.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    bitswapMockB._onPeerConnected = (peerId) => {
      expect(peerId.toB58String()).to.equal(peerInfoA.id.toB58String())
      if (++counter === 2) {
        finish()
      }
    }

    libp2pNodeA.swarm.dial(peerInfoB, (err) => {
      expect(err).to.not.exist
    })

    function finish () {
      bitswapMockA._onPeerConnected = () => {}
      bitswapMockB._onPeerConnected = () => {}
      done()
    }
  })

  it('connectTo success', (done) => {
    networkA.connectTo(peerInfoB.id, (err) => {
      expect(err).to.not.exist
      done()
    })
  })

  it('_receiveMessage success', (done) => {
    const msg = new Message(true)
    const b = new Block('hello')
    msg.addEntry(b.key, 0, false)
    msg.addBlock(b)
    msg.addBlock(new Block('world'))

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.deep.equal(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      bitswapMockB._receiveError = () => {}
      done()
    }

    bitswapMockB._receiveError = (err) => {
      expect(err).to.not.exist
    }

    const conn = libp2pNodeA.swarm.dial(peerInfoB, '/ipfs/bitswap/1.0.0', (err) => {
      expect(err).to.not.exist
    })

    const msgEncoded = msg.toProto()
    conn.write(msgEncoded)
    conn.end()
  })

  it('sendMessage', (done) => {
    const msg = new Message(true)
    const b = new Block('hello')
    msg.addEntry(b.key, 0, false)
    msg.addBlock(b)
    msg.addBlock(new Block('world'))

    bitswapMockB._receiveMessage = (peerId, msgReceived) => {
      expect(msg).to.deep.equal(msgReceived)
      bitswapMockB._receiveMessage = () => {}
      done()
    }

    networkA.sendMessage(peerInfoB.id, msg, (err) => {
      expect(err).to.not.exist
    })
  })
})
