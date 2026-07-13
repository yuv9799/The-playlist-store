import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { getCurrentUser } from "../../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (error) {
      return NextResponse.redirect(`${appUrl}/?youtube_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${appUrl}/?youtube_error=No+authorization+code+returned`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${appUrl}/?youtube_error=Google+OAuth+credentials+not+configured+on+server`);
    }

    // Exchange authorization code for tokens
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/callback/google`,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(`${appUrl}/?youtube_error=Token+exchange+failed`);
    }

    const data = await response.json();
    const { access_token, refresh_token, expires_in } = data;

    const user = await getCurrentUser();
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Upsert the Account mapping
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        platform: "YOUTUBE",
      },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token || existingAccount.refreshToken, // Google only returns refresh_token on the first consent
          expiresAt,
        },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          platform: "YOUTUBE",
          accessToken: access_token,
          refreshToken: refresh_token || null,
          expiresAt,
        },
      });
    }

    return NextResponse.redirect(`${appUrl}/?youtube=connected`);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${appUrl}/?youtube_error=${encodeURIComponent(err.message || "OAuth processing failed")}`);
  }
}
