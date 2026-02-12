import { Globe } from "lucide-react";

const DOMAIN_ICONS: Record<string, { src: string; label: string }> = {
  "docs.google.com": { src: "https://www.gstatic.com/images/branding/product/1x/docs_2020q4_48dp.png", label: "Google Docs" },
  "meet.google.com": { src: "https://www.gstatic.com/meet/google_meet_horizontal_wordmark_2020q4_1x_icon_124_40_2373e79660dabbf194273d27aa7ee1f5.png", label: "Google Meet" },
  "chatgpt.com": { src: "https://cdn.oaistatic.com/assets/favicon-miwirzcz.ico", label: "ChatGPT" },
  "gemini.google.com": { src: "https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png", label: "Gemini" },
  "mail.google.com": { src: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico", label: "Gmail" },
  "figma.com": { src: "https://static.figma.com/app/icon/1/favicon.png", label: "Figma" },
  "www.figma.com": { src: "https://static.figma.com/app/icon/1/favicon.png", label: "Figma" },
  "github.com": { src: "https://github.githubassets.com/favicons/favicon-dark.svg", label: "GitHub" },
};

interface DomainIconProps {
  domain: string;
  className?: string;
  size?: number;
}

export default function DomainIcon({ domain, className, size = 16 }: DomainIconProps) {
  const icon = DOMAIN_ICONS[domain];

  if (icon) {
    return (
      <img
        src={icon.src}
        alt={icon.label}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  return <Globe className={className} style={{ width: size, height: size }} />;
}
