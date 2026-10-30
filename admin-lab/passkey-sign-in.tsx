import { QrCode } from "lucide-react"
import { InlineLoading } from "./ui/loading"
import type { PasskeyLoginMethod } from "./passkey-login"

export function PasskeySignIn({ busy, method, onPhone }: {
  busy: boolean; method: PasskeyLoginMethod; onPhone: () => void
}) {
  return <>
    <button type="submit" className="primary" disabled={busy}>
      {busy && method === "device" ? <InlineLoading>기기 인증을 기다리고 있어요…</InlineLoading> : "패스키로 로그인"}
    </button>
    <button type="button" className="secondary passkey-phone-button" disabled={busy} onClick={onPhone} aria-describedby="passkey-phone-note">
      {busy && method === "phone" ? <InlineLoading>휴대폰 인증을 기다리고 있어요…</InlineLoading> : <><QrCode size={18} aria-hidden="true"/>휴대폰 QR로 로그인</>}
    </button>
    <p id="passkey-phone-note" className="passkey-phone-note">다른 컴퓨터에서는 휴대폰에 저장된 패스키로 인증할 수 있습니다.</p>
    <details className="passkey-phone-help">
      <summary>QR 로그인 준비 및 사용 방법</summary>
      <ol>
        <li>패스키가 저장된 휴대폰을 가까이 두고, 컴퓨터와 휴대폰의 Bluetooth·인터넷을 켜세요.</li>
        <li>‘휴대폰 QR로 로그인’을 누르세요. 선택 화면이 먼저 나오면 ‘다른 기기 사용’ 또는 ‘iPhone·iPad·Android 기기’를 선택하세요.</li>
        <li>브라우저의 QR을 휴대폰 카메라로 스캔하고, 휴대폰에서 얼굴·지문·잠금번호로 인증하세요.</li>
      </ol>
      <p>휴대폰에 <strong>admin.pnusmp.com</strong> 패스키가 없다면, 기존 기기로 로그인한 뒤 ‘로그인·인수인계 → 패스키 추가’에서 휴대폰을 등록하세요.</p>
      <p>QR 표시 방식은 브라우저·운영체제에 따라 다릅니다. 공용 컴퓨터에서는 사용 후 로그아웃하세요.</p>
    </details>
  </>
}
