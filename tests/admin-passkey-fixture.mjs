// Cryptographic WebAuthn test authenticator. Used only by tests, never shipped.
import { generateKeyPairSync, randomBytes, createHash, sign } from 'node:crypto'
const hash = value => createHash('sha256').update(value).digest()
const b64 = value => Buffer.from(value).toString('base64url')
function cbor(value) {
  const head = (major, n) => n < 24 ? Buffer.from([major * 32 + n]) : n < 256 ? Buffer.from([major * 32 + 24, n]) : Buffer.from([major * 32 + 25, n >> 8, n & 255])
  if (typeof value === 'number') return value < 0 ? head(1, -value - 1) : head(0, value)
  if (typeof value === 'string') { const s = Buffer.from(value); return Buffer.concat([head(3,s.length),s]) }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2,value.length),value])
  const entries = value instanceof Map ? [...value] : Object.entries(value)
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k,v]) => [cbor(k),cbor(v)])])
}
export function authenticator() {
  const pair = generateKeyPairSync('ec', {namedCurve:'prime256v1'}), jwk = pair.publicKey.export({format:'jwk'})
  const id = randomBytes(32), publicKey = cbor(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]))
  let counter = 0
  const data = (rpID, flags, count) => { const c = Buffer.alloc(4);c.writeUInt32BE(count);return Buffer.concat([hash(rpID),Buffer.from([flags]),c]) }
  return {
    id:b64(id),
    register(options, origin, flags=0x45) {
      const clientDataJSON = Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}))
      const authData = Buffer.concat([data(options.rp.id,flags,0),Buffer.alloc(16),Buffer.from([0,id.length]),id,publicKey])
      return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{credProps:{rk:true}},authenticatorAttachment:'platform',response:{clientDataJSON:b64(clientDataJSON),attestationObject:b64(cbor({fmt:'none',attStmt:{},authData})),transports:['internal']}}
    },
    authenticate(options, origin, flags=0x05) {
      const clientDataJSON = Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false}))
      const authenticatorData = data(options.rpId,flags,++counter)
      const signature = sign('sha256',Buffer.concat([authenticatorData,hash(clientDataJSON)]),{key:pair.privateKey,dsaEncoding:'der'})
      return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(clientDataJSON),authenticatorData:b64(authenticatorData),signature:b64(signature),userHandle:b64('smp-pdf-admin-trial')}}
    }
  }
}
export function cookieJar() {
  const values = new Map()
  return {
    read: () => [...values].map(([key,value])=>`${key}=${value}`).join('; '),
    set: response => { for(const item of response.headers.getSetCookie()) {const first=item.split(';')[0],i=first.indexOf('=');values.set(first.slice(0,i),first.slice(i+1))} },
    clear: () => values.clear(),
  }
}
