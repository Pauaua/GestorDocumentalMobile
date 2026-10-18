import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  secureToggle?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, icon: Icon, secureToggle, secureTextEntry, style, testID, multiline, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View style={styles.wrapper}>
      {label && <AppText variant="label">{label}</AppText>}
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        {Icon && <Icon size={18} color={colors.textMuted} strokeWidth={1.75} />}
        <TextInput
          ref={ref}
          {...props}
          testID={testID}
          accessibilityLabel={props.accessibilityLabel ?? label}
          multiline={multiline}
          secureTextEntry={hidden}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />
        {secureToggle && (
          <Pressable
            testID={testID ? `${testID}-toggle` : undefined}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
          >
            {hidden ? (
              <Eye size={18} color={colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <EyeOff size={18} color={colors.textSecondary} strokeWidth={1.75} />
            )}
          </Pressable>
        )}
      </View>
      {error ? (
        <AppText
          variant="caption"
          color="dangerStrong"
          testID={testID ? `${testID}-error` : undefined}
          accessibilityRole="alert"
        >
          {error}
        </AppText>
      ) : (
        hint && <AppText variant="caption">{hint}</AppText>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  focused: { borderColor: colors.accent, backgroundColor: colors.background },
  errored: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingVertical: spacing.sm,
    outlineStyle: 'none',
  } as object,
  inputMultiline: { minHeight: 90, textAlignVertical: 'top', paddingVertical: 0 },
});
