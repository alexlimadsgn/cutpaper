import { Box, Button, CloseButton, Dialog, Flex, Heading, Link, Portal, Stack, Text } from '@chakra-ui/react';
import { Scissors } from 'lucide-react';

const Youtube = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
  </svg>
);

const Instagram = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

declare const __APP_VERSION__: string;

/** Modal "Sobre": logo, versão, créditos e onde aprender a usar. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} placement="center">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="400px" borderRadius="2xl" overflow="hidden">
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" position="absolute" top={3} right={3} />
            </Dialog.CloseTrigger>
            <Dialog.Body pt={10} pb={8} px={8}>
              <Stack align="center" gap={2} textAlign="center">
                <Box
                  w="64px" h="64px" borderRadius="18px" bg="red.500" color="white" display="grid" placeItems="center"
                  boxShadow="0 10px 28px rgba(229,38,46,.35)"
                >
                  <Scissors size={32} />
                </Box>
                <Heading size="2xl" fontWeight="800" letterSpacing="-0.02em" mt={3}>CutPaper</Heading>
                <Text fontSize="xs" fontWeight="600" color="gray.500" bg="gray.100" px={3} py={1} borderRadius="full">
                  Versão {__APP_VERSION__}
                </Text>
                <Text fontSize="sm" color="gray.600" mt={3}>
                  Planificador de caixas e papelaria personalizada: molde com corte, vinco e sangria, arte por face
                  e verificação da montagem em 3D.
                </Text>

                <Box w="full" h="1px" bg="gray.100" my={4} />

                <Text fontSize="sm" color="gray.700">
                  Desenvolvido por{' '}
                  <Link href="https://instagram.com/alexlimadsgn" target="_blank" rel="noopener noreferrer" fontWeight="700" color="red.500">
                    Alex Lima
                  </Link>{' '}
                  com Claude Opus 5.5
                </Text>
                <Link href="https://instagram.com/alexlimadsgn" target="_blank" rel="noopener noreferrer" fontSize="xs" color="gray.500">
                  <Instagram size={13} /> @alexlimadsgn
                </Link>

                <Button asChild w="full" mt={5} colorPalette="red">
                  <a href="https://youtube.com/@alexlimadsgn" target="_blank" rel="noopener noreferrer">
                    <Youtube size={18} /> Aprenda a usar no YouTube
                  </a>
                </Button>
                <Flex fontSize="2xs" color="gray.400" mt={1}>youtube.com/@alexlimadsgn</Flex>
              </Stack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
