import { prisma } from "./db";

export async function getCurrentUser() {
  const email = "user@homepage.app";
  
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
      },
    });
  }

  return user;
}
