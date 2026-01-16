import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StatusBar, 
  TextInput, 
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import SwipeButton from 'rn-swipe-button';
import { TailwindProvider } from 'tailwindcss-react-native';
import { Ionicons } from '@expo/vector-icons';

import { CONFIG } from '../../constants/config';
import { styles } from '../../constants/styles';
import { mapStyle } from '../../constants/mapStyle';
import { useParking } from '../../hooks/useParking';
import { usePayment } from '../../hooks/usePayment';
import { formatPhoneNumber, validatePhoneNumber } from '../../utils/phoneFormatter';
import { locationService } from '../../services/locationService';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DRAWER_MIN_HEIGHT = 100;
const DRAWER_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;

const Parking = () => {
  const [location, setLocation] = useState<any | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(new Animated.Value(DRAWER_MAX_HEIGHT));
  const [isDrawerMinimized, setIsDrawerMinimized] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);

  const parking = useParking();
  const payment = usePayment({
    onPaymentSuccess: (mpesaReceipt) => {
      parking.completeParking(mpesaReceipt);
    },
  });

  // Pan responder for drawer drag
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          const newHeight = Math.max(
            DRAWER_MIN_HEIGHT,
            DRAWER_MAX_HEIGHT - gestureState.dy
          );
          drawerHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const currentHeight = DRAWER_MAX_HEIGHT - gestureState.dy;
        const threshold = (DRAWER_MIN_HEIGHT + DRAWER_MAX_HEIGHT) / 2;

        if (currentHeight < threshold) {
          // Minimize
          Animated.spring(drawerHeight, {
            toValue: DRAWER_MIN_HEIGHT,
            useNativeDriver: false,
          }).start();
          setIsDrawerMinimized(true);
        } else {
          // Maximize
          Animated.spring(drawerHeight, {
            toValue: DRAWER_MAX_HEIGHT,
            useNativeDriver: false,
          }).start();
          setIsDrawerMinimized(false);
        }
      },
    })
  ).current;

  // Show modal with auto-dismiss
  const showModal = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setModalMessage(message);
    setModalType(type);
    setModalVisible(true);
    
    setTimeout(() => {
      setModalVisible(false);
    }, CONFIG.UI.MODAL_AUTO_DISMISS);
  };

  // Handle parking toggle
  const toggleParking = () => {
    if (parking.isParking) {
      // Don't actually stop parking - just show payment modal
      // Timer continues in background
      setPaymentModalVisible(true);
      // Maximize drawer when payment modal opens
      Animated.spring(drawerHeight, {
        toValue: DRAWER_MAX_HEIGHT,
        useNativeDriver: false,
      }).start();
      setIsDrawerMinimized(false);
      // Focus phone input after modal opens
      setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 500);
    } else {
      parking.startParking();
      showModal('Parking started successfully!', 'success');
    }
  };

  // Handle cancel payment
  const handleCancelPayment = () => {
    Alert.alert(
      'Cancel Parking?',
      'Are you sure you want to cancel this parking session?',
      [
        {
          text: 'Continue Parking',
          onPress: () => {
            // Use resumeParking instead of startParking
            parking.resumeParking(location?.coords);
            setPaymentModalVisible(false);
          },
          style: 'default',
        },
        {
          text: 'Yes, Cancel',
          onPress: () => {
            parking.resetParking();
            payment.resetPayment();
            setPaymentModalVisible(false);
            showModal('Parking cancelled', 'warning');
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Handle payment initiation
  const handleInitiatePayment = () => {
    if (!payment.phoneNumber.trim()) {
      showModal('Please enter a phone number', 'error');
      return;
    }

    const formattedPhone = formatPhoneNumber(payment.phoneNumber);
    if (!formattedPhone) {
      showModal('Please enter a valid Kenyan phone number (e.g., 0712345678)', 'error');
      return;
    }

    payment.initiatePayment(
      formattedPhone,
      parking.parkingCost,
      async (transaction) => {
        // Save the parking session first
        await parking.completeParking(transaction.mpesaReceiptNumber || 'N/A');
        
        Alert.alert(
          'Payment Successful! 🎉',
          `Receipt: ${transaction.mpesaReceiptNumber || 'N/A'}\n\nYour parking payment has been confirmed.`,
          [
            {
              text: 'Done',
              onPress: () => {
                parking.resetParking();
                payment.resetPayment();
                setPaymentModalVisible(false);
              },
            },
          ]
        );
      },
      (error) => {
        Alert.alert('Payment Error', error, [{ text: 'OK' }]);
      }
    );
  };

  // Get modal styles
  const getModalStyles = () => {
    const styleMap = {
      error: {
        backgroundColor: '#fee',
        borderColor: '#fcc',
        icon: 'warning',
        iconColor: '#ff3b30',
      },
      warning: {
        backgroundColor: '#fff9e6',
        borderColor: '#ffe58f',
        icon: 'warning',
        iconColor: '#faad14',
      },
      success: {
        backgroundColor: '#f6ffed',
        borderColor: '#b7eb8f',
        icon: 'checkmark-circle',
        iconColor: '#52c41a',
      },
    };
    return styleMap[modalType];
  };

  const modalStyles = getModalStyles();

  // Fetch location
  useEffect(() => {
    (async () => {
      const hasPermission = await locationService.requestPermission();
      if (!hasPermission) {
        showModal('Location permission is required', 'error');
        setLoadingLocation(false);
        return;
      }

      const currentLocation = await locationService.getCurrentLocation();
      if (currentLocation) {
        setLocation(currentLocation);
      } else {
        showModal('Unable to fetch location', 'error');
      }
      setLoadingLocation(false);
    })();
  }, []);

  return (
    <TailwindProvider>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        
        {/* Dynamic Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, 
              { backgroundColor: modalStyles.backgroundColor, borderColor: modalStyles.borderColor }]}>
              <View style={styles.modalHeader}>
                <Ionicons 
                  name={modalStyles.icon as any} 
                  size={24} 
                  color={modalStyles.iconColor} 
                />
                <Text style={styles.modalTitle}>
                  {modalType === 'error' ? 'Error' : 
                   modalType === 'warning' ? 'Warning' : 'Success'}
                </Text>
              </View>
              <Text style={styles.modalMessage}>{modalMessage}</Text>
              <View style={styles.modalProgressBar}>
                <View 
                  style={[
                    styles.modalProgressFill,
                    { backgroundColor: modalStyles.iconColor }
                  ]} 
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Payment Modal - Minimizable Drawer */}
        <Modal
          animationType="none"
          transparent={true}
          visible={paymentModalVisible}
          onRequestClose={() => !payment.isProcessingPayment && handleCancelPayment()}
        >
          <View style={paymentStyles.overlay}>
            <TouchableOpacity 
              style={paymentStyles.backdrop}
              activeOpacity={0.8}
              onPress={() => !payment.isProcessingPayment && handleCancelPayment()}
            />
            
            <Animated.View
              style={[
                paymentStyles.drawer,
                { height: drawerHeight }
              ]}
              {...panResponder.panHandlers}
            >
              {/* Drawer Handle */}
              <View style={paymentStyles.handleContainer}>
                <View style={paymentStyles.handle} />
              </View>

              {/* Header with Close Button */}
              <View style={paymentStyles.headerContainer}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentModalTitle}>Complete Payment</Text>
                  {isDrawerMinimized && (
                    <Text style={paymentStyles.minimizedSubtitle}>
                      Tap to expand • KSH {parking.parkingCost}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={handleCancelPayment}
                  disabled={payment.isProcessingPayment}
                  style={paymentStyles.closeButton}
                >
                  <Ionicons 
                    name="close" 
                    size={24} 
                    color={payment.isProcessingPayment ? '#ccc' : CONFIG.UI.COLORS.TEXT_PRIMARY}
                  />
                </TouchableOpacity>
              </View>

              {/* Scrollable Content */}
              {!isDrawerMinimized && (
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  style={{ flex: 1 }}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                  <View style={styles.paymentModalContent}>
                    <Text style={styles.paymentModalSubtitle}>
                      {payment.paymentStatus === 'pending' 
                        ? 'Waiting for payment confirmation...' 
                        : 'Enter your phone number to pay'}
                    </Text>

                    <View style={styles.summarySectionPayment}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Duration</Text>
                        <Text style={styles.summaryValue}>{parking.formatTime()}</Text>
                      </View>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Rate</Text>
                        <Text style={styles.summaryValue}>KSH {CONFIG.PARKING.HOURLY_RATE}/hr</Text>
                      </View>
                      <View style={styles.summaryDivider} />
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabelTotal}>Total Amount</Text>
                        <Text style={styles.summaryValueTotal}>KSH {parking.parkingCost}</Text>
                      </View>
                    </View>

                    {payment.paymentStatus === 'pending' ? (
                      <View style={styles.paymentProcessingContainer}>
                        <ActivityIndicator size="large" color={CONFIG.UI.COLORS.PRIMARY} />
                        <Text style={styles.processingText}>
                          Waiting for you to complete payment on your phone...
                        </Text>
                        <Text style={styles.processingHint}>
                          Check your phone for M-Pesa STK Push prompt
                        </Text>
                        
                        {payment.checkoutRequestID && (
                          <View style={styles.transactionInfo}>
                            <Text style={styles.transactionId}>
                              Transaction ID: {payment.checkoutRequestID.substring(0, 12)}...
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.inputSection}>
                        <Text style={styles.inputLabel}>Phone Number</Text>
                        <View style={styles.phoneInputContainer}>
                          <Text style={styles.countryCode}>+{CONFIG.PHONE.COUNTRY_CODE}</Text>
                          <TextInput
                            ref={phoneInputRef}
                            style={styles.phoneInput}
                            placeholder="712 345 678"
                            placeholderTextColor="#ccc"
                            keyboardType="phone-pad"
                            value={payment.phoneNumber}
                            onChangeText={payment.setPhoneNumber}
                            maxLength={CONFIG.PHONE.MAX_LENGTH}
                            editable={!payment.isProcessingPayment}
                            returnKeyType="go"
                            onSubmitEditing={handleInitiatePayment}
                          />
                        </View>
                        <Text style={styles.inputHint}>
                          Enter your M-Pesa registered phone number
                        </Text>
                      </View>
                    )}

                    <View style={styles.paymentButtonContainer}>
                      <Text style={styles.paymentInfo}>
                        A payment prompt will be sent to your phone via M-Pesa
                      </Text>
                      
                      <View style={styles.buttonGroup}>
                        {payment.paymentStatus === 'pending' ? (
                          <TouchableOpacity
                            style={paymentStyles.cancelPaymentButton}
                            onPress={() => payment.cancelPayment()}
                          >
                            <Text style={paymentStyles.cancelPaymentButtonText}>
                              Cancel Payment
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <>
                            <TouchableOpacity
                              style={[styles.payButton, payment.isProcessingPayment && styles.payButtonDisabled]}
                              onPress={handleInitiatePayment}
                              disabled={payment.isProcessingPayment}
                            >
                              {payment.isProcessingPayment ? (
                                <ActivityIndicator size="small" color="white" />
                              ) : (
                                <>
                                  <Ionicons name="card-outline" size={20} color="white" />
                                  <Text style={styles.payButtonText}>
                                    Pay KSH {parking.parkingCost}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                            
                            <TouchableOpacity
                              onPress={handleCancelPayment}
                              disabled={payment.isProcessingPayment}
                            >
                              <Text style={[
                                styles.cancelButton,
                                payment.isProcessingPayment && { opacity: 0.5 }
                              ]}>
                                Cancel
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              )}
            </Animated.View>
          </View>
        </Modal>
        
        {/* Map Background */}
        {loadingLocation ? (
          <View style={styles.loadingContainer}>
            <Ionicons name="location" size={48} color={CONFIG.UI.COLORS.PRIMARY} />
            <Text style={styles.loadingText}>Finding your location...</Text>
          </View>
        ) : location ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            customMapStyle={mapStyle}>
            <Marker
              coordinate={{
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              }}
            >
              <View style={styles.markerContainer}>
                <View style={[styles.markerPin, parking.isParking && styles.markerPinActive]}>
                  <Ionicons name="car" size={16} color="white" />
                </View>
                <View style={styles.markerPulse} />
              </View>
            </Marker>
          </MapView>
        ) : (
          <View style={styles.loadingContainer}>
            <Ionicons name="location-off" size={48} color={CONFIG.UI.COLORS.DANGER} />
            <Text style={styles.errorText}>Unable to fetch location</Text>
          </View>
        )}

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIndicator, parking.isParking ? styles.statusActive : styles.statusInactive]} />
            <Text style={styles.statusText}>
              {parking.isParking ? 'Parking Active' : 'Ready to Park'}
            </Text>
          </View>
          
          {parking.isParking && (
            <View style={styles.timerContainer}>
              <View style={styles.timerRow}>
                <View style={styles.timerItem}>
                  <Ionicons name="time-outline" size={16} color={CONFIG.UI.COLORS.TEXT_SECONDARY} />
                  <Text style={styles.timerLabel}>Duration</Text>
                  <Text style={styles.timerValue}>{parking.formatTime()}</Text>
                </View>
                
                <View style={styles.timerItem}>
                  <Ionicons name="cash-outline" size={16} color={CONFIG.UI.COLORS.TEXT_SECONDARY} />
                  <Text style={styles.timerLabel}>Current Cost</Text>
                  <Text style={styles.costValue}>KSH {parking.parkingCost}</Text>
                </View>
              </View>
              
              <View style={styles.rateInfo}>
                <Text style={styles.rateText}>Rate: KSH {CONFIG.PARKING.HOURLY_RATE} per hour</Text>
              </View>
            </View>
          )}
        </View>

        {/* Bottom Slider */}
        <View style={styles.bottomContainer}>
          <View style={styles.sliderCard}>
            <View style={styles.sliderHeader}>
              <Ionicons 
                name={parking.isParking ? "lock-closed" : "lock-open"} 
                size={20} 
                color={parking.isParking ? CONFIG.UI.COLORS.DANGER : CONFIG.UI.COLORS.TEXT_SECONDARY} 
              />
              <Text style={styles.sliderTitle}>
                {parking.isParking ? 'Parking Active' : 'Start Parking'}
              </Text>
            </View>
            
            <SwipeButton
              key={parking.isParking ? 'parking-active' : 'parking-inactive'}
              height={56}
              width={Dimensions.get('window').width - 80}
              railBackgroundColor="#f0f0f0"
              railFillBackgroundColor={parking.isParking ? CONFIG.UI.COLORS.DANGER : CONFIG.UI.COLORS.PRIMARY}
              railFillBorderColor="transparent"
              railBorderColor="transparent"
              thumbIconBackgroundColor="white"
              thumbIconBorderColor="transparent"
              thumbIconComponent={() => (
                <View style={styles.thumbIcon}>
                  <Ionicons 
                    name="car" 
                    size={24} 
                    color={parking.isParking ? CONFIG.UI.COLORS.DANGER : CONFIG.UI.COLORS.PRIMARY} 
                  />
                </View>
              )}
              title={parking.isParking ? "Slide to stop" : "Slide to start parking"}
              titleColor={CONFIG.UI.COLORS.TEXT_PRIMARY}
              titleFontSize={16}
              titleStyles={{ fontWeight: '600' }}
              onSwipeSuccess={toggleParking}
              railStyles={{ borderRadius: 28 }}
              thumbIconStyles={{ borderRadius: 25 }}
              containerStyles={{ borderRadius: 28 }}
              resetAfterSuccess={true}
              resetThreshold={0.5}
            />
            
            <Text style={styles.sliderHint}>
              {parking.isParking 
                ? 'Your vehicle location is being tracked' 
                : 'Secure your parking spot with one swipe'
              }
            </Text>
          </View>
        </View>
      </View>
    </TailwindProvider>
  );
};

const paymentStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  drawer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f8f8f8',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CONFIG.UI.SPACING.LG,
    paddingVertical: CONFIG.UI.SPACING.MD,
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.UI.COLORS.BORDER,
  },
  minimizedSubtitle: {
    fontSize: 12,
    color: CONFIG.UI.COLORS.TEXT_SECONDARY,
    marginTop: CONFIG.UI.SPACING.XS,
    fontStyle: 'italic',
  },
  closeButton: {
    padding: CONFIG.UI.SPACING.SM,
  },
  cancelPaymentButton: {
    backgroundColor: CONFIG.UI.COLORS.DANGER,
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: CONFIG.UI.SPACING.MD,
  },
  cancelPaymentButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
});

export default Parking;