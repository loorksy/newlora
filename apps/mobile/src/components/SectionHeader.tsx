import React from 'react';
import { View } from 'react-native';
import { space } from '../theme';
import { Label, Row, styles } from './UI';

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
      <Label accessibilityRole="header" style={styles.section}>
        {title}
      </Label>
      {action || <View />}
    </Row>
  );
}
