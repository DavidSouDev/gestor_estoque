"use client";

import { useEffect } from "react";

const SWAGGER_UI_VERSION = "5.17.14";

export default function DocsPage() {
  useEffect(() => {
    const cssHref = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css`;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js`;
    script.async = true;
    script.onload = () => {
      // @ts-expect-error carregado via CDN, sem tipos
      window.SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        presets: [
          // @ts-expect-error carregado via CDN, sem tipos
          window.SwaggerUIBundle.presets.apis,
        ],
        layout: "BaseLayout",
      });
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  return <div id="swagger-ui" />;
}
