import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"ShopinBit · Monad Testnet",description:"Independent ShopinBit reference demo. Pay with test USDC on Monad Testnet.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
