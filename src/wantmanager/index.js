'use strict'

const debug = require('debug')
const _ = require('highland')

const Message = require('../message')
const Wantlist = require('../wantlist')
const cs = require('../constants')
const MsgQueue = require('./msg-queue')

const log = debug('bitswap:wantmanager')
log.error = debug('bitswap:wantmanager:error')

module.exports = class Wantmanager {
  constructor (network) {
    this.peers = new Map()
    this.wl = new Wantlist()

    this.network = network
  }

  _newMsgQueue (peerId) {
    return new MsgQueue(peerId, this.network)
  }

  _addEntries (keys, cancel) {
    let i = -1
    _(keys)
      .map((key) => {
        i++
        return new Message.Entry(key, cs.kMaxPriority - i, cancel)
      })
      .tap((e) => {
        // add changes to our wantlist
        if (e.cancel) {
          this.wl.remove(e.key)
        } else {
          this.wl.add(e.key, e.priority)
        }
      })
      .toArray((entries) => {
        // broadcast changes
        for (let p of this.peers.values()) {
          p.addEntries(entries, false)
        }
      })
  }

  _startPeerHandler (peerId) {
    let mq = this.peers.get(peerId)

    if (mq) {
      mq.refcnt ++
      return
    }

    mq = this._newMsgQueue(peerId)

    // new peer, give them the full wantlist
    const fullwantlist = new Message(true)
    for (let entry of this.wl.entries()) {
      fullwantlist.addEntry(entry[1].key, entry[1].priority)
    }
    mq.addMessage(fullwantlist)

    this.peers.set(peerId, mq)
    mq.run()
    return mq
  }

  _stopPeerHandler (peerId) {
    const mq = this.peers.get(peerId)

    if (!mq) {
      return
    }

    mq.refcnt --
    if (mq.refcnt > 0) {
      return
    }

    mq.stop()
    this.peers.delete(peerId)
  }

  // add all the keys to the wantlist
  wantBlocks (keys) {
    log('want blocks:', keys)
    this._addEntries(keys, false)
  }

  // cancel wanting all of the given keys
  cancelWants (keys) {
    log('cancel wants: ', keys)
    this._addEntries(keys, true)
  }

  // Returns a list of all currently connected peers
  connectedPeers () {
    return Array.from(this.peers.keys())
  }

  connected (peerId) {
    this._startPeerHandler(peerId)
  }

  disconnected (peerId) {
    this._stopPeerHandler(peerId)
  }

  run () {
    // TODO: is this needed? if so enable it
    //     // resend entirew wantlist every so often
    //     const es = []
    //     for (let e of this.wl.entries()) {
    //       es.push(new Message.Entry(e.key, e.priority))
    //     }

    //     this.peers.forEach((p) => {
    //       p.addEntries(es, true)
    //     })
    //     timer.start()
    //   }
    // }
  }
}
