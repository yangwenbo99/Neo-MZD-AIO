import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
const blocked = () => { throw new Error('network access is disabled for this test') }
net.Socket.prototype.connect = blocked
http.request = http.get = https.request = https.get = blocked
dns.lookup = dns.resolve = blocked
globalThis.fetch = blocked
syncBuiltinESMExports()
