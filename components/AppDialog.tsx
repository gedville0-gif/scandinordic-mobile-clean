import React from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet,
} from 'react-native';
import { COLORS } from '@/constants/colors';

export interface AppDialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AppDialogButton[];
  onClose?: () => void;
}

export function AppDialog({ visible, title, message, buttons, onClose }: AppDialogProps) {
  const s = makeStyles();
  const btns: AppDialogButton[] = buttons && buttons.length > 0
    ? buttons
    : [{ text: 'OK', style: 'default' }];

  // Render action buttons first (primary/destructive), cancel last
  const actionBtns = btns.filter(b => b.style !== 'cancel');
  const cancelBtns = btns.filter(b => b.style === 'cancel');
  const orderedBtns = [...actionBtns, ...cancelBtns];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.box} onPress={e => e.stopPropagation()}>
          <View style={s.body}>
            <Text style={s.title}>{title}</Text>
            {message ? <Text style={s.message}>{message}</Text> : null}
          </View>
          <View style={s.btnStack}>
            {orderedBtns.map((btn, i) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    s.btn,
                    isDestructive && s.btnDestructive,
                    isCancel && s.btnCancel,
                    !isDestructive && !isCancel && s.btnPrimary,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => {
                    btn.onPress?.();
                    onClose?.();
                  }}
                >
                  <Text
                    style={[
                      s.btnText,
                      isDestructive && s.btnTextDestructive,
                      isCancel && s.btnTextCancel,
                      !isDestructive && !isCancel && s.btnTextPrimary,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles() {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.88)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    box: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: COLORS.border,
      width: '100%',
      maxWidth: 340,
      overflow: 'hidden',
      paddingBottom: 4,
    },
    body: {
      padding: 24,
      paddingBottom: 20,
      gap: 8,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: COLORS.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    message: {
      fontSize: 13,
      color: COLORS.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    btnStack: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      gap: 8,
    },
    btn: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: {
      backgroundColor: COLORS.primary,
    },
    btnDestructive: {
      backgroundColor: COLORS.danger,
    },
    btnCancel: {
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '600',
    },
    btnTextPrimary: {
      color: COLORS.background,
      fontWeight: '700',
    },
    btnTextDestructive: {
      color: '#fff',
      fontWeight: '700',
    },
    btnTextCancel: {
      color: COLORS.textSecondary,
      fontWeight: '500',
    },
  });
}

/**
 * Imperative helper — returns a promise that resolves with the tapped button index.
 * Index is based on the ORIGINAL buttons array order (not the display order).
 */
export function useAppDialog() {
  const [dialogState, setDialogState] = React.useState<{
    visible: boolean;
    title: string;
    message?: string;
    buttons?: AppDialogButton[];
    resolve?: (idx: number) => void;
  }>({ visible: false, title: '' });

  const show = React.useCallback((
    title: string,
    message?: string,
    buttons?: AppDialogButton[],
  ): Promise<number> => {
    return new Promise(resolve => {
      setDialogState({ visible: true, title, message, buttons, resolve });
    });
  }, []);

  const dialog = (
    <AppDialog
      visible={dialogState.visible}
      title={dialogState.title}
      message={dialogState.message}
      buttons={(dialogState.buttons ?? [{ text: 'OK' }]).map((b, i) => ({
        ...b,
        onPress: () => { dialogState.resolve?.(i); b.onPress?.(); },
      }))}
      onClose={() => {
        dialogState.resolve?.(dialogState.buttons?.length ?? 1);
        setDialogState(s => ({ ...s, visible: false }));
      }}
    />
  );

  return { show, dialog };
}
